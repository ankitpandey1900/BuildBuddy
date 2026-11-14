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

