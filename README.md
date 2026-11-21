# BuildBuddy

**Understand what you've built. Know how it works. Take control of your codebase.**

BuildBuddy is a professional offline engineering intelligence workbench for software architects and developers. It statically scans, analyzes, and indexes codebases into a deterministic relational model with zero cloud dependencies and zero telemetry.

## Key Capabilities

- **100% Offline Core**: Pure static analysis powered by Tree-sitter and SQLite (FTS5 + Blake3). Never executes, alters, or uploads project source files.
- **Visual Architecture & Component Topology**: High-level and low-level interactive architectural diagrams, module boundaries, and framework topology.
- **Core Intelligence**: Instant symbol exploration with cyclomatic complexity risk radar, caller/callee fan-in/fan-out graph, and provenance tracking (`confirmed`, `static`, `inferred`).
- **Security & Code Health Audit**: Rule-based static detection of hardcoded secrets, dangerous sinks, circular dependency cycles, and dead code.
- **Visual Grounded Documentation**: Deterministic, evidence-backed documentation (Overview, HLD, LLD, API routes with HTTP method pills, Database ER schemas, ADRs) with interactive Mermaid diagram rendering and Markdown export.
- **Instant Command Palette (`Ctrl+K`)**: Rapid full-text search across all files, functions, classes, and workbench commands.

## Tech Stack

- **Desktop Framework**: Tauri 2 + Rust
- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS
- **Visualization**: React Flow, ELK.js, Mermaid.js
- **Database**: SQLite (rusqlite) + FTS5
- **Parsers**: Tree-sitter

## Getting Started

### Prerequisites

- Node.js (v18+)
- Rust & Cargo (latest stable)

### Development

```bash
# Install frontend dependencies
npm install

# Run desktop app in development
npm run tauri dev
```

### Build

```bash
# Build desktop application
npm run build
npm run tauri build
```
