# BuildBuddy: Agent Rules

Source of truth: docs/PRD.md. Read the relevant sections before every task.

## Stack (fixed, do not substitute)
Tauri 2, Rust backend, React + TypeScript + Vite, Tailwind with custom design tokens,
Radix UI, TanStack Table, React Flow + ELK.js, SQLite (rusqlite) + FTS5, Tree-sitter.

## Hard rules
- Core analysis must work fully offline with no LLM. Never make it depend on AI.
- Never modify, execute, or shell out on files from the analyzed project.
- Every relationship/finding stores provenance (file, line range, evidence type).
  Label results as: confirmed | static | inferred | unknown.
- UI: professional engineering workbench. No gradients, glows, sparkles, AI badges,
  chatbot-first UI, or decorative animation. Neutral palette, thin borders, dark + light theme.
- Generated docs use direct engineering language. No filler phrases, no invented decisions.
- No placeholder/mock data presented as real results. No TODO stubs without a tracked note.
- Keep Rust modules small and separated: scanner, parser, symbols, graph, store, commands.
- Every feature ships with tests. Run build + tests before declaring a task done.

## Workflow
- Work only on the phase/task I assign. Do not start later phases.
- Before coding, produce a short plan listing files to create and acceptance criteria.
- After coding, report: what works, what is stubbed, how to run it, what is untested.
- If the PRD is ambiguous, pick the simplest option, note it in docs/DECISIONS.md, and continue.