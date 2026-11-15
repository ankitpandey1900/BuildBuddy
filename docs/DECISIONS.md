# Architecture & Technical Decisions

## 1. Windows Build Setup

### Context
BuildBuddy relies on offline static analysis powered by:
1. **SQLite (`rusqlite`) with bundled SQLite3 + FTS5** — requires compiling `sqlite3.c` into the binary.
2. **Tree-sitter (`tree-sitter`, `tree-sitter-typescript`, `tree-sitter-python`)** — requires compiling C/C++ grammar files (`parser.c`, `scanner.c`).

Because of these native C/C++ dependencies, Rust's `cc-rs` crate requires a functional native C/C++ compiler and linker on the host operating system.

### Decision
The official and supported Windows build environment for BuildBuddy is **MSVC (Microsoft Visual C++)** using the `x86_64-pc-windows-msvc` Rust target.

### Required Toolchain
- **Visual Studio Build Tools (2022 or 2026)** with the **Desktop development with C++** workload:
  - MSVC v143/v144 C++ x64/x86 build tools (`Microsoft.VisualStudio.Workload.VCTools`, `Microsoft.VisualStudio.Component.VC.Tools.x86.x64`)
  - Linker: `link.exe`
  - Compiler: `cl.exe`
- **Windows SDK**: Windows 10/11 SDK (e.g. `10.0.26100.0` or `Microsoft.VisualStudio.Component.Windows11SDK.26100`).
- **WebView2 Runtime**: Evergreen WebView2 (pre-installed on Windows 10 and 11).
- **Rust Toolchain**: `stable-x86_64-pc-windows-msvc` configured as default via:
  ```bash
  rustup default stable-x86_64-pc-windows-msvc
  ```
- **Node.js**: v18+ with `npm`.

### Why Not GNU/MinGW?
1. Existing 32-bit MinGW installations in system `PATH` conflict and cause `{Illegal System DLL Relocation}` (OS error 623) on Windows 11.
2. GNU toolchain requires separate GCC runtime DLL distributions (`libgcc_s_seh-1.dll`, `libwinpthread-1.dll`).
3. Tauri 2 officially targets and tests against MSVC on Windows, ensuring first-class WebView2 and Windows API bindings.

## 2. Tree-sitter Grammar & Core Dependencies

### Context
Tree-sitter Rust bindings vary across major/minor versions in the `Language` ABI and exported function symbols. To avoid C ABI mismatches, all grammar crates must target the same Tree-sitter runtime version.

### Decision & Verified Versions
We tested and verified compilation on MSVC for the following mutually compatible versions:
- `tree-sitter = "0.22"` (resolved: `0.22.6`)
- `tree-sitter-typescript = "0.21"` (resolved: `0.21.2`, provides `language_typescript()` and `language_tsx()`)
- `tree-sitter-python = "0.21"` (resolved: `0.21.0`, provides `language()`)
- `rusqlite = "0.31"` with `features = ["bundled"]` for offline embedded SQLite + FTS5
- `rayon = "1.10"` for parallel worker pool parsing

## 3. Parsing Provenance and Golden Test Policy

### Context
Code intelligence requires strict provenance linking every symbol and import to its exact source range and snippet. Golden tests must guard against silent drift and unintended symbol loss.

### Decision
1. **Provenance Enforcement**: Every symbol, import, and export persisted to SQLite has an associated `source_evidence` row (`start_line`, `end_line`, `snippet`, `evidence_type = 'ast_node' | 'import_stmt' | 'export_stmt'`). The `imports` and `exports` tables reference `source_evidence(id)` via `source_evidence_id`.
2. **Verify-Only Golden Tests**: `test_verify_ts_golden` and `test_verify_py_golden` are strictly verify-only. If `expected-symbols.json`, `expected-imports.json`, or `expected-exports.json` are missing or mismatched, tests fail. Regenerating expected JSON requires the explicit opt-in environment flag `UPDATE_GOLDEN=1`.
3. **Tree-sitter Timeout Interrupt**: Native timeouts are enforced via `parser.set_timeout_micros()`, which leverages Tree-sitter's C-level loop deadline check (`ts_parser_set_timeout_micros`) to halt runaway parses mid-execution rather than checking elapsed time after completion.
4. **Non-Silent Handling**: Files marked `Unsupported`, `Partial`, `SkippedTooLarge`, or `Timeout` are persisted with their explicit status and displayed in the Explorer with visual status badges.

## 4. Symbol Extraction Conventions: Visibility, Constants vs Functions, and Signatures

### 1. Visibility Enum Values
Visibility values stored in `symbols.visibility` (and `ExtractedSymbol.visibility`):
- `"public"`: Explicitly annotated `public` modifier in TypeScript, or default un-prefixed identifier in Python.
- `"private"`: Explicitly annotated `private` modifier in TypeScript, or single leading underscore in Python (`_helper`, excluding dunders).
- `"protected"`: Explicitly annotated `protected` modifier in TypeScript.
- `"special"`: Python dunder methods (`__init__`, `__str__`, `__repr__`, etc.).
- `None`: Top-level/module functions, variables, constants, type aliases, and interfaces without accessibility modifiers.

### 2. Constant vs Function Naming Rule
When a `const` or assignment is encountered:
- **TypeScript / JavaScript**:
  - If the right-hand side is an arrow function (`val.kind() == "arrow_function"`) or function expression (`val.kind() == "function"`), the symbol kind is classified as `SymbolKind::Function` (with `is_async`, parameter list, return type, and signature `const <name> = [async ](<params>): <return_type>`).
  - Otherwise, a `const` declaration is classified as `SymbolKind::Constant`.
  - `let` and `var` declarations are classified as `SymbolKind::Variable`.
- **Python**:
  - Top-level assignments `NAME = ...` are classified as `SymbolKind::Constant` if and only if the identifier name consists entirely of uppercase letters and underscores (`name.chars().all(|c| c.is_uppercase() || c == '_')`).
  - Otherwise, top-level assignments are classified as `SymbolKind::Variable`.

### 3. Signature Format Conventions
- **Functions & Methods**:
  - Base format: `[static ][async ][def |function ]<name>(<params>)[ -> <return_type> | : <return_type>]`
  - Decorators (Python): Prepended verbatim with newlines preceding the `def`:
    ```python
    @decorator(arg=1)
    def name(...) -> ...
    ```
  - Constructor (TypeScript): Formatted as `constructor(<params>)` (omits `: void` when no return type is explicitly annotated in source).
  - Regular TypeScript functions/methods without explicit return type default to `: void` (or `: any` for arrow functions without annotation).
  - Regular Python functions/methods without return annotation omit the `->` clause.
- **Classes**:
  - TypeScript: `class <Name>[ extends <Base>][ implements <Interfaces>]`
  - Python: `class <Name>[(<Superclasses>)]`
- **Interfaces & Type Aliases**:
  - `interface <Name>`
  - `type <Name>`
- **Parameters**:
  - Formatted as `<name>[: <type>][ = <default_value>]`
- **Declaration Columns Range**:
  - `start_column` and `end_column` describe the complete declaration statement, including leading keywords (`export`, `async`, `public`, `static`) or decorators.

## 5. Import Resolution, Dependency Analysis & Incremental Engine

### 1. TypeScript & JavaScript Import Resolution
- **Probing Priority**:
  1. Direct match with exact path.
  2. Extension mapping: replaces `.js`, `.jsx`, `.mjs`, `.cjs` with `.ts`, `.tsx`, `.d.ts`.
  3. Candidate extensions: `.ts`, `.tsx`, `.d.ts`, `.js`, `.jsx`, `.mjs`, `.cjs`, `.json`.
  4. Index file candidates: `/index.ts`, `/index.tsx`, `/index.d.ts`, `/index.js`, `/index.jsx`, `/index.mjs`, `/index.cjs`, `/index.json`.
- **Path Aliases & BaseUrl**:
  - Parsed from `tsconfig.json` (or `jsconfig.json`) `compilerOptions.paths` and `compilerOptions.baseUrl`.
  - Wildcard prefixes like `@components/*` map to target directory paths relative to baseUrl.
- **Status Classification**:
  - Matches project file: `ResolutionStatus::Internal`.
  - Relative prefix (`./`, `../`, `/`) without match: `ResolutionStatus::Unresolved`.
  - Non-relative prefix without alias match: `ResolutionStatus::External`.

### 2. Python Import Resolution
- **Relative Imports (PEP 328)**:
  - Count leading dots: 1 dot = current package directory, 2 dots = parent directory, 3 dots = grandparent directory.
  - Probes `<path>.py` and `<path>/__init__.py`.
- **Absolute Imports**:
  - Probes root directory package/module and `src/` prefix package/module.
  - Standard library and third-party packages classified as `ResolutionStatus::External`.

### 3. Circular Dependency Cycle Detection
- Tarjan's Strongly Connected Components (SCC) algorithm runs over internal import edges.
- Components with `len > 1` (or self-loops) are extracted and persisted in `findings` table under category `circular_dependency` with severity `medium` and confidence `confirmed`.

### 4. Manifest Parsing & Unused Dependencies
- Parsers:
  - `package.json`: `dependencies` (direct), `devDependencies` (dev), `peerDependencies` (peer), `optionalDependencies` (optional).
  - `requirements.txt`: PEP 508 version specs, dev classification if filename contains `dev` or `test`.
  - `pyproject.toml`: PEP 621 `[project.dependencies]` & `[project.optional-dependencies]`, and Poetry `[tool.poetry.dependencies]` & `[tool.poetry.group.<group>.dependencies]`.
- Unused Heuristic:
  - Compares manifest packages against imported package root names (handling scoped npm packages `@scope/pkg`, Python underscore/hyphen normalization, and `@types/` packages).
  - Common build tools (`vite`, `vitest`, `eslint`, `prettier`, `pytest`, `black`, `mypy`, etc.) flagged with `is_likely_tooling = true` and `info` severity; unimported runtime packages flagged with `low` severity and confidence `inferred`.

### 5. Incremental Scan & Hash Change Tracking
- Compares BLAKE3 hashes against SQLite `files` table.
- Unchanged files are skipped entirely (`files_skipped_unchanged`).
- Modified files delete existing symbols, imports, exports, and edges, and queue for re-parse.
- Deleted files trigger SQLite cascade deletion of all child records.

### 6. Read-Only Git Detection & Changed Files Parser

- **Pure-Rust Git Parser Rationale (Why Hand-Written Reader was Kept over gix/git2)**:
  - We considered `git2` (bindings to C `libgit2`) and `gix` (pure-Rust git oxide).
  - `git2` requires building the C library with CMake and OpenSSL/WinHTTP, introducing native toolchain fragility and potential build failures in restricted or offline environments.
  - Furthermore, `git2` and `gix` require heavy transitive dependencies (over 80+ crates) that were neither in the initial project configuration nor in the local offline cargo cache, substantially increasing build times and binary footprint.
  - Spawning a `git` binary violates AGENTS.md rule: "Never modify, execute, or shell out on files from the analyzed project" and introduces runtime system dependencies (git must be installed and in PATH).
  - Consequently, we chose a hand-crafted pure-Rust parser for Git metadata:
    1. `.git/HEAD` reference parsing (supports branch symref and detached HEAD sha).
    2. `.git/refs/heads/*` and `.git/packed-refs` lookup.
    3. Worktrees and submodules (`gitdir: <path>`).
    4. `.git/index` binary parser (DIRC format) parsing 62-byte entry headers, mtime, ctime, file size, object SHA-1, flags, and path.
    5. Pure-Rust RFC 3174 SHA-1 implementation for computing blob hashes (`blob <size>\0<content>`).
  - **Git Changed-Files Limitations**:
    - **Index Versions Supported**: Supports Git binary DIRC format versions 2 and 3 (with standard 62-byte fixed entry headers followed by null-padded path strings). DIRC format version 4 (prefix path compression) and optional extension blocks (e.g. UNTR, TREE, REUC, EOIE) are not parsed.
    - **Untracked / Newly Added Files Not Detected**: Only entries present in `.git/index` are compared against the working tree (detecting modified and deleted tracked files). Brand new untracked files or files created in the working tree without being added to the git index are not reported in `changed_files`.
    - **No Tree Objects Unpacking**: The parser compares filesystem metadata/hashes against the index, rather than unpacking loose or packed commit tree objects.

## 7. Cyclomatic Complexity Formula & Metric Definitions

### Context
Code metrics such as cyclomatic complexity, branch counts, and loop counts must be computed deterministically offline without LLM interpretation or variability across platforms.

### Decision & Arithmetic Formula
We compute McCabe's Cyclomatic Complexity using the standard decision-point formula:
$$CC = 1 + D$$
where $D$ is the number of distinct decision points (branches, loops, short-circuit operators, and exception handlers) encountered within the function/method body:

$$\text{Cyclomatic Complexity} = 1 + \sum \text{branches} + \sum \text{loops}$$

Specifically:
- **Base Complexity**: Every function begins with a base complexity of `1`.
- **Branch Points (+1 each)**:
  - `if` statements / `elif` clauses (TypeScript: `if_statement`; Python: `if_statement`, `elif_clause`).
  - Ternary / conditional expressions (TypeScript: `ternary_expression`; Python: `conditional_expression`).
  - `switch` non-default cases (TypeScript: `case_clause` or `switch_case`).
  - Short-circuit boolean binary expressions:
    - TypeScript/JavaScript: `&&`, `||`, `??` (nullish coalescing).
    - Python: `and`, `or`.
  - Exception catch/except handlers:
    - TypeScript/JavaScript: `catch_clause`.
    - Python: `except_clause`.
- **Loop Points (+1 each)**:
  - TypeScript/JavaScript: `for_statement`, `for_in_statement`, `for_of_statement`, `while_statement`, `do_statement`.
  - Python: `for_statement`, `while_statement`.

### Examples with Arithmetic
1. Simple function without branching:
   $CC = 1 \text{ (base)} = 1$
2. Single `if`:
   $CC = 1 \text{ (base)} + 1 \text{ (if)} = 2$
3. `if` with compound condition `(a && b)`:
   $CC = 1 \text{ (base)} + 1 \text{ (if)} + 1 \text{ (&&)} = 3$
4. `for` loop enclosing `if/else` and `try/catch`:
   $CC = 1 \text{ (base)} + 1 \text{ (for)} + 1 \text{ (if)} + 1 \text{ (catch)} = 4$
5. `switch` with 3 `case` clauses and 1 `default`:
   $CC = 1 \text{ (base)} + 3 \text{ (case clauses)} = 4$

## 8. Side-Effect Marker Patterns

### Context
To identify potential side effects (file system operations, network requests, database interactions) statically without false claims of dynamic execution, BuildBuddy applies an explicit pattern matching list.

### Decision
- **Confidence Level**: Matches are recorded with confidence `"static"`, never `"confirmed"`.
- **Pattern Match Categories**:
  1. **File System (`fs`)**:
     - `fs.readFile`, `fs.readFileSync`, `fs.writeFile`, `fs.writeFileSync`, `fs.open`, `fs.unlink`, `fs.mkdir`, `fs.rmdir`, `fs.createReadStream`, `fs.createWriteStream`, `fs.promises`, `promises.readFile`, `promises.writeFile`.
     - Python: `open`, `read`, `write`, `close`, `os.remove`, `os.unlink`, `os.mkdir`, `os.rmdir`, `os.path`, `pathlib.Path`, `shutil.copy`, `shutil.rmtree`.
  2. **Network (`network`)**:
     - `fetch`, `axios`, `http.get`, `http.request`, `https.get`, `https.request`, `WebSocket`.
     - Python: `requests.get`, `requests.post`, `requests.put`, `requests.delete`, `requests.request`, `urllib.request`, `aiohttp`, `httpx.get`, `httpx.post`, `socket.connect`, `socket.send`.
  3. **Database (`db`)**:
     - `query`, `execute`, `connect`, `cursor`, `session.query`, `session.add`, `session.commit`, `session.rollback`.
     - `prisma`, `prisma.findUnique`, `prisma.findMany`, `prisma.create`, `prisma.update`, `prisma.delete`.
     - `repository.find`, `findOne`, `createConnection`, `select`, `insert`, `update`, `delete`, `commit`, `rollback`.

## 9. Call Edge Resolution Status & Provenance Hierarchy

### Context
Every call site extracted from source code must be cataloged with strict provenance and an objective resolution status.

### Resolution Statuses:
- **`confirmed`**: Resolved to a concrete symbol in the project via:
  1. Same-scope local definition (e.g. function defined in the module).
  2. Method called on `this`/`self` defined in the same class.
  3. Concrete import resolved to an exported symbol in a target module.
- **`static`**:
  1. Method call on `this` or `self` resolving to a parent class method (`this.method()` or `self.method()`) where the target method is inherited from a superclass rather than defined in the immediate class.
  2. Name match within the same module, without an explicit import proof.
- **`inferred`**: Method call on an unknown receiver (e.g. `client.fetchData()`, `resp.json()`), dynamic call (e.g. `obj[name]()`, `getattr(obj, name)()`), or callback parameter invocation.
- **`unknown`**: Identifier or call target that cannot be resolved to any symbol.

### Rule
Never upgrade a status to make output appear more complete. Dynamic and ambiguous calls must strictly remain `inferred` or `unknown`. Every call edge must link to an explicit `source_evidence` record.

## 10. Framework Detection, Entry Points & Module Grouping Heuristics

### Context
Offline architecture discovery must identify active technology frameworks, startup entry points, and cohesive architectural layers strictly from verifiable repository evidence without relying on an LLM or guessing.

### 1. Multi-Signal Framework Detection & Confidence Classification
We evaluate four distinct physical signals for supported ecosystems (React, Next.js, Express, Vue, FastAPI, Flask, Django):
1. **Manifest Dependency (`manifest_dependency`)**: Declared dependency in `package.json`, `requirements.txt`, or `pyproject.toml`.
2. **Configuration File (`config_file`)**: Dedicated framework configuration files (e.g. `next.config.*`, `vite.config.*`, `vue.config.js`, `manage.py`, `settings.py`).
3. **AST Import Statement (`import_usage`)**: Direct syntax node import of framework modules (e.g. `import React from 'react'`, `from fastapi import FastAPI`, `import express from 'express'`).
4. **Source Pattern (`source_pattern`)**: Concrete framework idioms (e.g. `createRoot(container)`, `app.listen(port)`, `app = FastAPI()`, `app = Flask(__name__)`, `createApp()`, `models.Model`).

### Confidence Assignment & Declared-Only Frameworks:
- **`static`**: Manifest dependency plus AST import statement, configuration file, or concrete source pattern. Static analysis cannot prove dynamic runtime execution, so verified code usage with manifest presence is classified strictly as `"static"`, never `"confirmed"`.
- **Declared-Only (Not a Framework Detection)**: A manifest dependency with no import usage or code usage is NOT a framework detection. It is reported separately in `declared_only` (`name`, `version`, `dependency_type`, `file_path`, `line_number`) and persisted to the `declared_frameworks` table.
- **Negative Detection Rule**: If a framework appears only in comments or string literals, it is rejected by AST inspection. Package names appearing only in devDependencies without code usage are reported only in `declared_only`, never in detected frameworks.

### 2. Application Entry Points
Entry points represent verified startup locations for application execution:
- **`main`**: `package.json` `"main"` field.
- **`bin`**: `package.json` `"bin"` executable definitions.
- **`script`**: `package.json` startup scripts strictly limited to `"start"`, `"dev"`, and `"serve"`. Build, test, and lint scripts (e.g. `npm run build`, `npm test`) are build tooling and are NOT entry points.
- **`framework_entry`**: Conventional framework startup locations (e.g. `Express HTTP Server Entry` for `app.listen()`, `React DOM Root Entry` for `createRoot()`, Next.js route entry files, Vue `createApp()`, Django `manage.py`/`wsgi.py`).
- **`main_block`**: Python `if __name__ == "__main__":` blocks.
- **`app_factory`**: Application factory functions (e.g. `create_app()`, `app = FastAPI()`, `app = Flask()`).

All entry points detected statically are assigned `confidence: "static"`. Every entry point is recorded with file path, line range, source snippet, and an explicit `source_evidence` foreign key.

### 3. Module Grouping & Layer Labeling
- **Directory Grouping**: Modules are grouped by logical root directories (subdirectories of `src/` or top-level project directories).
- **Exact Layer Classification Evidence Rules**:
  - `frontend`: Requires an import of React, Vue, Next or Single File Component `.vue`, or all files in module are `.tsx`/`.jsx`/`.vue`/`.css`/`.html`, or directory name contains `client`, `frontend`, `ui`, `pages`, `components`, `views`.
  - `backend`: Requires import of Express, FastAPI, Flask, Django or server listener calls (`.listen()`), or directory name contains `server`, `backend`, `api`, `controllers`, `routes`, `services`, `handlers`.
  - `data`: Contains ORM entities, schemas, database migrations, SQL, or directory name contains `models`, `entities`, `data`, `db`, `migrations`, `schemas`, `repositories`.
  - `config`: Contains configuration files (`tsconfig.json`, `package.json`, `.config.*`, `settings.py`) or directory `config`/`settings`. Root directory `.` is labeled `config` if all files are config files.
  - `shared`: Modules imported by both a frontend and backend module, or directory matching `shared`, `common`, `utils`, `lib`.
  - `unclassified`: Any module lacking conclusive physical evidence.
- **Strict Rule**: Speculative architectural paradigms (e.g. "MVC", "Microservices", "Clean Architecture", "Hexagonal Architecture") must never be applied without explicit structural proof.
- **Import Cohesion Metric**: Computed deterministically as:
  $$\text{Cohesion} = \frac{E_{\text{internal}}}{E_{\text{internal}} + E_{\text{outgoing}}}$$
  (evaluated to 1.0 if the module has no internal or outgoing dependencies).

### 4. Architecture Graph Persistence & Edge Provenance
- Architecture nodes, groups, and edges are persisted to the SQLite `diagrams` table (`diagram_type = 'architecture'`, `layout_engine = 'elk'`).
- Every edge stored in the architecture graph stores a reference to a valid `source_evidence` record (`evidence_id`).
- **Interactive Canvas Rendering**: The interactive graph diagram canvas rendering (React Flow + ELK layout) is currently **stubbed**; architecture data is persisted and summarized tabularly in Overview, but visual node-link rendering on canvas is not yet implemented.

### 5. Overview UI Constraints (PRD 8.3 & Agents.md Rule 4)
- **No Composite Health Score**: No composite, synthetic, or graded health scores exist in the UI. Every displayed metric represents a countable, verifiable repository property.
- Every metric provides a tooltip definition and provides interactive drill-down to underlying database records.
- Clicking any framework opens the `FrameworkEvidenceModal` displaying the complete evidence provenance list.
- Declared-only packages (dependencies without import usage) are presented in a dedicated section separate from detected frameworks.






