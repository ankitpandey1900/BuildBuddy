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
1. **Provenance Enforcement**: Every symbol and import persisted to SQLite has an associated `source_evidence` row (`start_line`, `end_line`, `snippet`, `evidence_type = 'symbol_def' | 'import_stmt'`). The `imports` table references `source_evidence(id)` via `source_evidence_id`.
2. **Verify-Only Golden Tests**: `test_verify_ts_golden` and `test_verify_py_golden` are strictly verify-only. If `expected-symbols.json` is missing or mismatched, tests fail. Regenerating expected JSON requires the explicit opt-in environment flag `UPDATE_GOLDEN=1`.
3. **Tree-sitter Timeout Interrupt**: Native timeouts are enforced via `parser.set_timeout_micros()`, which leverages Tree-sitter's C-level loop deadline check (`ts_parser_set_timeout_micros`) to halt runaway parses mid-execution rather than checking elapsed time after completion.
4. **Non-Silent Handling**: Files marked `Unsupported`, `Partial`, `SkippedTooLarge`, or `Timeout` are persisted with their explicit status and displayed in the Explorer with visual status badges.



