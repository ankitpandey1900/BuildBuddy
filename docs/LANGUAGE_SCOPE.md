# BuildBuddy MVP Language Scope Specification

**Status:** Approved Language Support Contract  
**Reference:** [PRD.md Section 5.3 & 15](file:///d:/Projects/Vibe%20Code/13_BuildBuddy/docs/PRD.md#L235-L259), [Agents.md](file:///d:/Projects/Vibe%20Code/13_BuildBuddy/Agents.md)  
**Selected Languages for MVP:** **TypeScript / JavaScript** and **Python**

---

## 1. Recommendation & Justification

For the BuildBuddy MVP, we recommend deep, first-class static analysis for **TypeScript/JavaScript** and **Python** for three decisive reasons:

1. **Market Prevalence in Target Audience:**
   The primary users identified in PRD Section 3 are developers building applications with AI coding tools (Claude, Cursor, Copilot) or inheriting modern full-stack web and API repositories. Over 85% of AI-generated projects use TypeScript/JavaScript (Next.js, React, Node, Express, NestJS) or Python (FastAPI, Django, Flask, LangChain, PyTorch).
2. **Complementary Ecosystem Archetypes:**
   - *TypeScript/JavaScript* provides a representative model for typed OOP/functional hybrid languages, module bundlers, path aliases, nested directory imports, and interface/type contracts.
   - *Python* provides a representative model for package/module resolution (`__init__.py`, relative dotted imports), decorator-driven frameworks (FastAPI routes, Pydantic models), and script-to-service structures.
3. **Mature, Battle-Tested Tree-sitter Grammars:**
   Rust bindings for `tree-sitter-typescript` (supporting both TS and TSX) and `tree-sitter-python` are production-grade, fast, fault-tolerant against syntax errors, and maintain zero external runtime dependencies.

---

## 2. Tree-sitter Grammar Dependencies

In `src-tauri/Cargo.toml`:

```toml
[dependencies]
tree-sitter = "0.22"
tree-sitter-typescript = "0.21"
tree-sitter-python = "0.21"
```

---

## 3. TypeScript & JavaScript Scope Definition

### 3.1 Extensions & File Types
- `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs`

### 3.2 Symbols Extracted

| Symbol Kind | AST Node Types | Extracted Properties |
|---|---|---|
| **Function** | `function_declaration`, `arrow_function`, `function_expression` | Name, signature, parameter names/types, return type, `is_async`, `is_generator`, start/end line bounds |
| **Class** | `class_declaration`, `class` | Name, superclass name (`extends`), implemented interfaces (`implements`), start/end line bounds |
| **Method** | `method_definition` | Name, signature, visibility (`public`, `private`, `protected`), `is_static`, `is_async`, parameter names/types, return type |
| **Interface** | `interface_declaration` | Name, extended interfaces (`extends`), declared properties & signatures |
| **Type Alias** | `type_alias_declaration` | Name, definition snippet |
| **Variable / Const**| `lexical_declaration`, `variable_declarator` | Identifier name, type annotation (if top-level or exported) |
| **Export Status** | `export_statement`, `export_default` | Boolean flag `is_exported = true` for public interface identification |

### 3.3 Import Extraction & Resolution Rules

BuildBuddy extracts and resolves both ES Modules and CommonJS:

1. **ES Module Imports:**
   - `import defaultExport from './module'`
   - `import { namedExport, a as b } from './module'`
   - `import * as ns from './module'`
   - `import './side-effect-module'`
   - `import type { TypeOnly } from './types'` (`is_type_only = 1`)
2. **CommonJS Requires:**
   - `const mod = require('./module')`
   - `const { named } = require('./module')`
3. **Dynamic Imports:**
   - `import('./dynamic-module')` (flagged with `confidence = 'static'`)
4. **Resolution Algorithm:**
   - **Relative Paths:** Given `./utils` from `src/api/client.ts`, probe in order:
     1. `src/api/utils.ts`
     2. `src/api/utils.tsx`
     3. `src/api/utils.js`
     4. `src/api/utils/index.ts`
     5. `src/api/utils/index.tsx`
     6. `src/api/utils/index.js`
   - **Path Aliases:** Read `compilerOptions.paths` and `baseUrl` from `tsconfig.json` or `jsconfig.json`. E.g., `@/*` -> `./src/*`.
   - **External Dependencies:** Non-relative, unmapped imports (e.g., `import express from 'express'`) are resolved against `package.json` dependencies.

### 3.4 Call Graph Extraction
- **Call Sites:** AST `call_expression` and `new_expression`.
- **Callee Identification:**
  - Direct calls: `calculateTotal()` -> callee name `"calculateTotal"`
  - Member calls: `userService.findUser()` -> object `"userService"`, method `"findUser"`
  - Constructor calls: `new PaymentProcessor()` -> constructor `"PaymentProcessor"`
- **Resolution:**
  - Match callee names against local file functions, imported symbols, or class methods.
  - Where target cannot be determined with 100% certainty (e.g. dynamic callback or interface polymorphism), store edge with `confidence = 'inferred'`.

---

## 4. Python Scope Definition

### 4.1 Extensions & File Types
- `.py`, `.pyw`

### 4.2 Symbols Extracted

| Symbol Kind | AST Node Types | Extracted Properties |
|---|---|---|
| **Function** | `function_definition` | Function name, parameters (positional, keyword, `*args`, `**kwargs`), return type annotation, `is_async`, docstring |
| **Class** | `class_definition` | Class name, base classes (inheritance list), docstring |
| **Method** | `function_definition` inside class | Method name, parameter list, decorator list (`@classmethod`, `@staticmethod`, `@property`), docstring |
| **Decorators** | `decorator` | Decorator name (e.g. `@app.get`, `@dataclass`, `@pytest.fixture`), target symbol ID |
| **Constants** | `assignment` at module level | Uppercase identifier names (e.g. `DEFAULT_TIMEOUT = 30`) |

### 4.3 Import Extraction & Resolution Rules

1. **Standard & Package Imports:**
   - `import os, sys`
   - `import package.module as alias`
   - `from package.module import ClassName as Alias, func_name`
   - `from package import *`
2. **Relative Imports:**
   - `from . import sibling_module` (1 dot: current directory)
   - `from .models import User`
   - `from ..common.utils import logger` (2 dots: parent directory)
3. **Resolution Algorithm:**
   - **File-based module:** `package/module.py`
   - **Package directory:** `package/module/__init__.py`
   - **Standard Library / Third-Party:** Checks against Python standard library list and project manifest (`requirements.txt`, `Pipfile`, `pyproject.toml`).

### 4.4 Call Graph Extraction
- **Call Sites:** AST `call` nodes.
- **Callee Identification:**
  - Function invocation: `verify_token(req)` -> `"verify_token"`
  - Object method invocation: `self.db.execute(query)` -> callee `"execute"`
  - Class instantiation: `model = NeuralNet()` -> constructor `"NeuralNet"`
- **Resolution:**
  - Match callee against imported symbols, locally defined functions in module scope, or class definitions.

---

## 5. Scope Boundaries & Explicit Non-Goals for MVP

To ensure high reliability and avoid fragile heuristics, the MVP strictly delineates what is in scope vs out of scope:

### Explicitly In Scope (Must Work 100% Offline)
- Accurate syntax parsing without crashing on syntax errors.
- Stable symbol extraction with exact line and column coordinates.
- Import path resolution across files, directories, and package manifests.
- Import graph cycle detection.
- Call site extraction with `source_evidence` anchoring.
- Framework entry-point recognition (e.g. Express `app.listen()`, FastAPI `app = FastAPI()`).

### Explicitly Out of Scope for MVP
1. **Dynamic Code Execution:** Never execute Python files or Node.js runtime code to evaluate dynamic constructs.
2. **Dynamic Imports & Metaprogramming:** Constructs such as `importlib.import_module(var)`, `eval()`, `exec()`, or Python `__getattr__` dynamic dispatch are labeled as `unknown` with no guessed target.
3. **Full Cross-File Type Solver:** BuildBuddy will not re-implement `tsc` or `pyright`. If a type cannot be resolved statically from local declarations or direct imports, it remains labeled as `static` or `unknown`.
4. **Inter-Process RPC / Microservice Tracing:** Tracing HTTP requests across multiple disparate repositories is reserved for Phase 4/5. In MVP, HTTP calls (e.g. `axios.get` or `requests.get`) are extracted as external endpoints.

