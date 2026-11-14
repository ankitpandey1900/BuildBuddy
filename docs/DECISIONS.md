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



