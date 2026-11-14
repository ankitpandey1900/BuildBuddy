# BuildBuddy
## Product Requirements Document & Engineering Blueprint

**Version:** 1.0  
**Status:** Initial product specification  
**Platforms:** Windows and macOS  
**Product type:** Local-first desktop application

---

# 1. Product Vision

BuildBuddy helps developers understand software projects that have become difficult to navigate, maintain, or explain.

A developer might have:
- Built an entire application using AI coding tools.
- Inherited an unfamiliar repository.
- Created a project without proper documentation.
- Lost track of how modules, services, and functions interact.
- Accumulated duplicated logic, unused files, and unnecessary dependencies.
- Built something that works but cannot confidently explain how it works.

BuildBuddy analyzes the project and produces a structured engineering understanding of it.

It should help answer:

- What exactly does this project do?
- How is it structured?
- How does the application start?
- How does data move through the system?
- Which file is responsible for which functionality?
- How do functions and modules depend on one another?
- What happens when a user performs a particular action?
- Where are APIs, database operations, and business rules implemented?
- What architectural decisions have been made?
- What is poorly designed, duplicated, unused, or risky?
- How can the project be improved?

## Product positioning

BuildBuddy is not primarily a code generator.

It is a software understanding and engineering intelligence tool.

**Core positioning statement:**

Understand what you've built. Know how it works. Take control of your codebase.

---

# 2. Product Principles

These principles should influence every product, design, and engineering decision.

## 2.1 Engineering-first experience

The interface should feel like professional engineering software.

Reference the usability and visual discipline of:
- Linear for interface consistency.
- JetBrains IDEs for information density.
- VS Code for navigation and code interaction.
- DataGrip for structured inspection.
- Professional architecture tools for diagrams.

These are references for usability, not interfaces to copy.

## 2.2 No AI-themed interface

Do not use:
- Neon gradients.
- Glowing borders.
- Purple and blue AI gradients.
- Glowing orb animations.
- Floating AI assistant buttons.
- Excessive rounded cards.
- Chatbot-first navigation.
- Decorative animated backgrounds.
- Generic AI dashboard templates.
- Unnecessary sparkles or AI badges.

The product should not visually advertise that it uses AI.

Local intelligence should be a capability behind the product, not its visual identity.

## 2.3 Evidence before explanation

Every important analysis result should be traceable to actual project evidence.

For example:

Instead of saying:

"The authentication module handles user authentication."

Show:

- Authentication module.
- Source file.
- Relevant functions.
- Imported dependencies.
- Routes using the module.
- Database operations involved.
- Relevant line references.

Distinguish between:
- Confirmed findings.
- Static-analysis observations.
- Runtime observations.
- Inferred behavior.
- Unknown or unverified behavior.

## 2.4 Offline-first

The application must work without an internet connection.

- Project analysis runs locally.
- Database and indexes remain local.
- No mandatory cloud inference.
- No mandatory account.
- No telemetry requirement.
- No remote repository upload.
- Local AI is optional.
- Documentation generation must work without an LLM.

## 2.5 Professional documentation

Generated documentation should look like engineering documentation written by a developer who understands the project.

It must not sound like an AI-generated essay.

Avoid:
- "In today's rapidly evolving technological landscape..."
- "Let's dive into..."
- "It is worth noting that..."
- "This comprehensive document aims to..."
- Repetitive summaries.
- Excessive introductory paragraphs.
- Generic conclusions.
- Marketing language.

Use direct engineering language, meaningful headings, concise explanations, tables, diagrams, references, and implementation details.

---

# 3. Target Users

## Primary users

1. Developers building applications with AI coding tools.
2. Developers inheriting unfamiliar repositories.
3. Solo developers maintaining multiple projects.
4. Developers who need to understand their own old projects.
5. Engineering teams reviewing architecture and technical debt.

## Secondary users

- Technical leads.
- Software architects.
- Students learning from real-world projects.
- Consultants auditing existing applications.

---

# 4. Core Product Workflow

The main user journey:

1. Open BuildBuddy.
2. Select a project folder.
3. BuildBuddy scans the repository.
4. BuildBuddy detects languages, frameworks, dependencies, and project structure.
5. The analysis engine parses source files and extracts symbols.
6. It builds relationships between files, functions, classes, APIs, and data models.
7. It performs static analysis and identifies potential issues.
8. It builds an indexed project knowledge base.
9. It generates architecture diagrams and documentation.
10. The developer explores the project through diagrams, source references, and structured reports.
11. The developer asks natural-language questions if local intelligence is enabled.
12. The developer exports documentation and reports.

The complete workflow must work without local AI. AI should improve explanations and cross-module reasoning, not determine the basic analysis results.

---

# 5. Functional Requirements

## 5.1 Project management

BuildBuddy must support:

- Open existing project folder.
- Create a project workspace.
- Reopen previously analyzed projects.
- Multiple project workspaces.
- Project metadata.
- Project analysis history.
- Re-scan project.
- Incremental analysis.
- Exclude folders and files.
- Custom ignore patterns.
- Detect Git repository.
- Detect changed files.
- Compare previous analysis with current analysis.

The application must never modify source files during normal analysis.

## 5.2 Repository explorer

Provide a complete file and folder explorer.

Required information:

- File name.
- File extension.
- Language.
- File size.
- Number of lines.
- Number of functions.
- Number of classes.
- Number of imports.
- Number of references.
- Analysis status.

Features:

- Search files.
- Filter by language.
- Filter by file type.
- Find unused or potentially unreachable files.
- Show file dependencies.
- Show references.
- Navigate directly to source code.

## 5.3 Language and framework detection

Detect languages and frameworks using multiple signals.

Examples:

- TypeScript.
- JavaScript.
- Python.
- Rust.
- Go.
- Java.
- Kotlin.
- C#.
- PHP.
- Ruby.
- C and C++.
- HTML, CSS, and SQL.

Framework detection should include common ecosystems such as React, Next.js, Vue, Angular, Express, NestJS, FastAPI, Django, Flask, Spring, .NET, Laravel, and others.

Detection must use actual project evidence, such as manifests, configuration files, imports, and source patterns.

Do not claim complete language support when only basic parsing is available.

## 5.4 File-level code intelligence

For each supported file, extract:

- File purpose.
- Exports.
- Imports.
- Functions.
- Classes.
- Interfaces.
- Types.
- Constants.
- Variables.
- Methods.
- Function parameters.
- Return types.
- Function calls.
- Dependencies.
- References.
- Complexity indicators.
- Relevant comments.
- Error-handling patterns.

Each symbol should have a stable identity and source location.

## 5.5 Function and class analysis

For every function, provide:

- Name and signature.
- Source location.
- Purpose.
- Parameters.
- Return value.
- Called functions.
- Functions that call it.
- Imported dependencies used.
- Important conditions.
- Loops and branching.
- Error-handling paths.
- Side effects.
- External operations.
- Complexity indicators.

For classes, also provide:

- Properties.
- Methods.
- Constructors.
- Inheritance.
- Implemented interfaces.
- Relationships with other classes.
- Instantiation locations.

Where behavior cannot be established statically, clearly label it as inferred or unknown.

## 5.6 Architecture analysis

Build a project-level architecture view.

Identify:

- Application entry points.
- Frontend and backend boundaries.
- Modules.
- Services.
- Controllers.
- Routes.
- Middleware.
- Data-access layers.
- Database models.
- External integrations.
- Background workers.
- Shared utilities.
- Configuration boundaries.

Generate:
- High-level architecture diagram.
- Component diagram.
- Module dependency diagram.
- Application startup flow.
- Major data-flow diagrams.
- API interaction diagrams.
- Database relationship diagram where applicable.

Architecture classification must be evidence-based. Do not label a project as microservices, clean architecture, MVC, or hexagonal architecture without supporting evidence.

## 5.7 API analysis

Extract:

- HTTP methods.
- Routes.
- Controllers.
- Request parameters.
- Request body schemas where discoverable.
- Response patterns.
- Middleware.
- Authentication requirements where detectable.
- External API calls.
- Internal service calls.

Provide:
- API inventory.
- Endpoint-to-controller mapping.
- Endpoint-to-service mapping.
- Endpoint-to-database-operation mapping where traceable.
- API flow diagrams.

Do not assume a route is protected simply because an authentication package is installed.

## 5.8 Database analysis

Detect:

- Database engines.
- ORM frameworks.
- Models and entities.
- Tables.
- Fields.
- Types.
- Primary keys.
- Foreign keys.
- Relationships.
- Index declarations.
- Migrations.
- Queries.
- Repository patterns.

Generate an ER diagram.

Where relationships are inferred rather than explicitly declared, distinguish them from confirmed relationships.

## 5.9 Dependency analysis

Provide:

- Direct dependencies.
- Development dependencies.
- Internal dependencies.
- External dependencies.
- Dependency relationships.
- Circular dependencies.
- Potentially unused dependencies.
- Version information.
- Dependency concentration and hotspots.

Do not automatically remove dependencies.

## 5.10 Static analysis and engineering health

Identify potential:

- Dead code.
- Unused imports.
- Unreachable code.
- Duplicate logic.
- Circular dependencies.
- Excessive complexity.
- Large and highly coupled modules.
- Missing error handling.
- Unsafe configuration.
- Hardcoded secrets.
- Insecure patterns.
- Missing tests.
- Risky data handling.

Use rule-based analysis wherever possible.

Security results must distinguish confirmed secret exposure from heuristic matches and potential vulnerabilities.

Never present a heuristic warning as a confirmed exploit.

## 5.11 Project question answering

Optional local intelligence feature.

Example questions:

- Where does login happen?
- How does the application load dashboard data?
- Which files are involved when a user creates an order?
- Where is payment validation performed?
- Explain the data flow from frontend to database.
- What happens when this function fails?
- Why does this module depend on these services?

Answers should include:
- Relevant files.
- Function and class names.
- Line references where available.
- Supporting relationships.
- Confidence and uncertainty.
- A clear distinction between observed facts and interpretation.

Never send the complete repository to an LLM by default.

---

# 6. Documentation Generation System

This is one of the most important features of BuildBuddy.

The product should generate documentation that looks like a developer or architect has prepared it for a real engineering team.

Documentation should be structured, technical, readable, and grounded in the repository.

## 6.1 Documentation types

### Project overview
- Project purpose.
- Main capabilities.
- Technology stack.
- Directory structure.
- Entry points.
- Major modules.
- External integrations.

### HLD — High-Level Design
- System context.
- Architecture overview.
- Major components.
- Component responsibilities.
- External systems.
- Communication paths.
- Data flow.
- Deployment overview when detectable.

### LLD — Low-Level Design
- Module-level design.
- Class and function responsibilities.
- Internal dependencies.
- Important algorithms.
- Data structures.
- Control flow.
- Error handling.
- Interfaces and contracts.

### ADR — Architecture Decision Records

Support standard numbered ADR files.

Example:

`docs/adr/0001-use-sqlite-for-local-analysis.md`

Recommended structure:

# ADR 0001: Use SQLite for Local Analysis Storage

**Status:** Accepted  
**Date:** YYYY-MM-DD

## Context

The application needs a persistent local store for project metadata, extracted symbols, dependency relationships, and analysis results.

## Decision

Use SQLite as the primary local persistence layer.

## Alternatives Considered

| Option | Consideration |
|---|---|
| SQLite | Embedded, local, transactional |
| PostgreSQL | Requires a separate server |
| JSON files | Poor fit for relational queries |

## Consequences

- No separate database service is required.
- Data remains local to the user's machine.
- Schema migrations must be maintained.
- Large graph queries require appropriate indexing.

ADR generation must never invent historical decisions.

If a decision is proposed by BuildBuddy, identify it as a proposed ADR, not an existing architectural decision.

### Other documents

- System design document.
- Component design document.
- API documentation.
- Database schema documentation.
- Data-flow documentation.
- Sequence diagrams.
- Deployment architecture.
- Security review.
- Dependency inventory.
- Testing strategy.
- Technical debt report.
- Code review report.
- Developer onboarding guide.
- Glossary.
- Change impact report.
- Release notes.

## 6.2 Natural engineering writing style

Use these writing rules:

1. Start with the actual subject.
2. Prefer descriptive headings over long introductions.
3. Use concise paragraphs.
4. Use tables for structured information.
5. Use diagrams when relationships are easier to understand visually.
6. Explain why a component exists and what it does.
7. Reference actual source files.
8. Avoid unnecessary adjectives.
9. Do not repeat information in multiple sections.
10. Separate facts, assumptions, and recommendations.
11. Use consistent terminology.
12. Do not invent decisions, requirements, or implementation details.

Bad:

"This comprehensive document provides an insightful overview of the various components that work together to facilitate the application's functionality."

Good:

"The API layer handles incoming HTTP requests. Controllers validate request data and delegate business operations to services. Services access persistent data through repositories."

The second style should be the default throughout BuildBuddy.

## 6.3 Documentation editing

Users must be able to:

- Preview documents.
- Edit documents.
- Regenerate selected sections.
- Preserve manual changes.
- Compare generated revisions.
- Export Markdown.
- Export PDF.
- Export HTML.
- Export supported diagram formats.
- Save documents inside the project.
- Save documentation to an external folder.

Never silently overwrite user-authored documents.

Use a managed documentation workflow:
- Generated content.
- User-edited content.
- Source evidence.
- Generation timestamp.
- Revision history.
- Change detection.

Provide a clear indication when source changes make a document stale.

---

# 7. Diagramming System — Product Priority

Diagrams should be a first-class product capability, not a decorative feature added to reports.

A good diagram should communicate complex software relationships at a glance.

## 7.1 Diagram quality requirements

Every diagram must have:

- Clear hierarchy.
- Meaningful grouping.
- Consistent node sizing.
- Consistent typography.
- Proper spacing.
- Orthogonal or clean routed connectors.
- Minimal line crossings.
- Readable labels.
- Clear arrow direction.
- Consistent relationship notation.
- Appropriate legends.
- Light and dark theme support.
- Zoom and pan.
- Fit-to-screen.
- Search and focus.
- Export at high resolution.

Never create diagrams with randomly positioned nodes or overlapping labels.

## 7.2 Required diagram types

| Diagram | Purpose |
|---|---|
| System context | Show system boundaries and external actors |
| Container diagram | Show major applications and services |
| Component diagram | Explain internal components |
| Module dependency graph | Show module relationships |
| File dependency graph | Show imports and references |
| Class diagram | Show OOP relationships |
| Sequence diagram | Show interaction order |
| Activity diagram | Show process and decision flow |
| Flowchart | Explain business logic |
| ER diagram | Show database structure |
| API flow diagram | Show endpoint interactions |
| Data-flow diagram | Show movement of data |
| Call graph | Show function call relationships |
| Deployment diagram | Show runtime infrastructure |
| State diagram | Show state transitions |

## 7.3 Diagram interaction

Users should be able to:

- Click a component to open its source.
- Click an edge to inspect the relationship.
- Expand or collapse groups.
- Filter by relationship type.
- Highlight upstream dependencies.
- Highlight downstream dependencies.
- Search nodes.
- Isolate a module.
- View source references.
- Switch diagram layouts.
- Export SVG, PNG, and PDF where supported.

## 7.4 Diagram rendering strategy

Use structured diagram models as the source of truth.

Recommended architecture:

1. Extract graph data from source code.
2. Normalize nodes and edges.
3. Apply graph-specific rules.
4. Generate a layout.
5. Render through a diagram renderer.
6. Attach source references.
7. Provide interactive navigation.

Recommended tools:

- React Flow / XYFlow for interactive graph exploration.
- ELK.js for layered and orthogonal graph layouts.
- Mermaid for concise text-based diagrams and documentation.
- Graphviz as an optional rendering/export engine.
- Monaco for source code navigation.

Do not use Mermaid as the only renderer for all diagrams. Complex dependency graphs and large architectures need a more capable interactive layout system.

## 7.5 Diagram visual standards

Use a restrained engineering visual language.

- Neutral backgrounds.
- Thin borders.
- Consistent component shapes.
- Restrained status colors.
- No glow effects.
- No decorative gradients.
- No unnecessary shadows.
- Strong contrast.
- Readable text at normal zoom.

Color must communicate meaning, not decoration.

Example:
- Frontend: neutral blue-grey.
- Backend: neutral green-grey.
- Database: neutral amber.
- External services: neutral purple-grey.
- Warnings: muted red.
- Selected node: brand accent.

The palette must be accessible and consistent in both themes.

## 7.6 Diagram accuracy

Every edge must represent a known relationship.

Examples:
- Imports.
- Function calls.
- Inheritance.
- API requests.
- Data reads and writes.
- Declared dependencies.
- Runtime-observed interactions.

Different relationship types must not be visually conflated.

If a relationship is inferred, label it as inferred.

For large repositories, use progressive disclosure. Start with a readable overview, then allow users to drill down into modules and files.

---

# 8. User Interface and UX Specification

## 8.1 Design direction

BuildBuddy should look like a professional engineering workbench.

The UI should be:
- Calm.
- Precise.
- Dense but readable.
- Functional.
- Consistent.
- Fast.
- Keyboard-friendly.

Avoid a chatbot-centric dashboard.

## 8.2 Main application layout

Recommended structure:

**Top application bar**
- Project selector.
- Project search.
- Analysis status.
- Current project branch where available.
- Settings.

**Left navigation**
- Overview.
- Explorer.
- Architecture.
- Dependencies.
- APIs.
- Database.
- Code Intelligence.
- Security.
- Reports.
- Documentation.

**Main workspace**
- Context-dependent content.
- Tables.
- Diagrams.
- Source code.
- Analysis results.

**Right inspection panel**
- Selected file or symbol details.
- Relationships.
- Source references.
- Metrics.
- Findings.

The right panel should be collapsible and resizable.

## 8.3 Overview screen

Display useful engineering information:

- Project name.
- Languages.
- Frameworks.
- File count.
- Module count.
- Symbol count.
- API endpoint count.
- Database entities.
- Test inventory.
- Dependency count.
- Analysis completion.
- Major findings.
- Architecture overview.

Avoid arbitrary health scores that cannot be explained.

Every metric should have a definition and a way to inspect its underlying records.

## 8.4 Explorer screen

Three-panel layout:

1. Repository tree.
2. Source code viewer.
3. File intelligence panel.

The code viewer should support syntax highlighting, line numbers, symbol navigation, and source references.

Use Monaco or CodeMirror 6 depending on performance and packaging requirements.

## 8.5 Architecture screen

A large interactive diagram workspace.

- Diagram canvas.
- Diagram type selector.
- Filter panel.
- Layout selector.
- Minimap where useful.
- Zoom controls.
- Export.
- Selected component inspector.

The diagram canvas should receive most of the available screen space.

## 8.6 Documentation screen

A document-oriented editor.

- Document tree.
- Document preview or editor.
- Table of contents.
- Source references.
- Revision history.
- Export actions.

The writing experience should resemble a technical documentation editor, not an AI chat transcript.

## 8.7 Theme system

Provide dark and light themes.

Both should use neutral engineering-tool aesthetics.

Avoid excessive use of saturated colors.

Use typography, spacing, borders, and hierarchy to distinguish information.

## 8.8 Interaction standards

- Keyboard shortcuts for navigation.
- Command palette.
- Resizable panels.
- Persistent workspace state.
- Tooltips for unfamiliar technical terms.
- Searchable tables.
- Virtualized large lists.
- Clear loading and error states.
- Accessible focus indicators.
- No blocking operations on the UI thread.

---

# 9. Technical Architecture

## 9.1 Recommended technology stack

| Layer | Technology |
|---|---|
| Desktop framework | Tauri 2 |
| Frontend | React + TypeScript |
| Build system | Vite |
| Desktop backend | Rust |
| UI primitives | Radix UI |
| Styling | Tailwind CSS with custom design tokens |
| Graph rendering | React Flow / XYFlow |
| Graph layout | ELK.js |
| Code editor | Monaco or CodeMirror 6 |
| Tables | TanStack Table |
| Local database | SQLite |
| Search | SQLite FTS5 |
| Parsing | Tree-sitter and language-specific parsers |
| Documentation | Markdown |
| Diagram generation | Structured graph models + Mermaid |
| Local LLM runtime | llama.cpp, optional |
| Testing | Vitest, Playwright, Rust tests |

Choose the editor after a prototype benchmark. Monaco offers a familiar VS Code-like experience; CodeMirror 6 can be a lighter option.

## 9.2 High-level architecture

BuildBuddy should contain two independent engines.

### Engine A: Core Analysis Engine

Always available.

Responsibilities:
- Repository scanning.
- Language detection.
- Parsing.
- Symbol extraction.
- Dependency analysis.
- Call graph extraction.
- API detection.
- Database analysis.
- Static analysis.
- Metrics.
- Indexing.
- Diagram generation.
- Documentation generation from structured facts.

### Engine B: Local Intelligence Engine

Optional.

Responsibilities:
- Natural-language file explanations.
- Cross-module reasoning.
- Business-logic interpretation.
- Contextual project questions.
- Better technical documentation prose.
- Recommendation explanations.

The Core Analysis Engine must not depend on the Local Intelligence Engine.

## 9.3 Analysis pipeline

1. Repository discovery.
2. Ignore/exclusion filtering.
3. File classification.
4. Language detection.
5. Parsing.
6. Symbol extraction.
7. Relationship extraction.
8. Framework and API detection.
9. Database extraction.
10. Static analysis.
11. Graph construction.
12. Index creation.
13. Diagram generation.
14. Documentation generation.
15. Analysis persistence.

Use incremental analysis so changes to a small set of files do not require a complete repository scan.

## 9.4 Core data model

Recommended entities:

- Project
- ProjectVersion
- File
- Language
- Framework
- Module
- Symbol
- Function
- Class
- Interface
- Import
- Reference
- CallRelationship
- Dependency
- APIEndpoint
- DatabaseEntity
- DatabaseField
- DatabaseRelationship
- Finding
- AnalysisRun
- Diagram
- Document
- DocumentRevision
- SourceEvidence

Important: Store source locations and evidence with relationships.

A graph edge without provenance is not sufficient for trustworthy explanations.

## 9.5 Local intelligence architecture

Recommended flow:

1. User asks a question.
2. Search the local project index.
3. Retrieve relevant files, symbols, graph relationships, and source ranges.
4. Build a limited evidence package.
5. Send the package to the local model.
6. Generate an explanation.
7. Validate cited file and symbol references.
8. Present the answer with source navigation.

Model-generated content must never silently become authoritative project metadata.

---

# 10. Local AI and Hardware Management

The product must remain fully usable without a local language model.

## 10.1 Runtime

Package a managed local inference runtime rather than requiring users to install Python or Ollama.

A possible implementation is a bundled llama.cpp runtime using GGUF models.

Use a local-only process:
- Bind to 127.0.0.1.
- Use a session-specific port.
- Restrict access to the application.
- Shut down when no longer needed.
- Never expose the service to the LAN.

## 10.2 Model management

Provide:
- Import local GGUF model.
- Optional model download.
- Model metadata.
- Quantization details.
- Context settings.
- Hardware compatibility estimate.
- Model benchmark.
- Load and unload controls.
- Storage management.

Model downloads must be an explicit user action.

The application must work offline after installation and model import.

## 10.3 Resource management

Detect:
- Available RAM.
- CPU architecture.
- CPU cores.
- GPU availability.
- VRAM where detectable.
- Available disk space.

Use conservative memory estimates.

Allow users to:
- Limit analysis concurrency.
- Pause indexing.
- Limit model context.
- Unload idle models.
- Continue core analysis without AI.

Do not assume that a model fits merely because its file size is smaller than installed RAM.

---

# 11. Security and Privacy

Security is a product requirement, not an optional enhancement.

- Process project files locally.
- Do not execute source code during static analysis.
- Do not execute package scripts.
- Treat repositories as untrusted input.
- Protect against path traversal.
- Limit file sizes and parser resource consumption.
- Avoid following symlinks outside the selected project unless explicitly allowed.
- Redact secrets in logs.
- Never include secret values in generated documentation.
- Restrict local inference network exposure.
- Avoid shell command construction from untrusted file content.
- Validate export paths.
- Provide clear file-access permissions.

Dynamic analysis, if introduced, must use an explicit isolated execution environment and opt-in controls.

---

# 12. Performance and Reliability

Initial engineering targets:

- Responsive interface during background analysis.
- Incremental indexing.
- Cancellation of long-running operations.
- Recoverable analysis failures.
- Persistent project state.
- No unnecessary full repository rescans.
- Efficient graph rendering.
- Virtualized file and symbol tables.
- Memory-aware task scheduling.

Suggested benchmark fixtures:

- Small project: 1,000 files.
- Medium project: 10,000 files.
- Large project: 50,000 files.

These are benchmark targets, not guaranteed performance claims.

Track:
- Scan time.
- Parse time.
- Indexing time.
- Memory usage.
- Database size.
- Diagram rendering time.
- UI responsiveness.

Analysis should report unsupported files and partial parsing rather than silently ignoring them.

---

# 13. Testing Strategy

## Unit tests

Test:
- Language detection.
- Parser adapters.
- Symbol extraction.
- Relationship extraction.
- Dependency resolution.
- API extraction.
- Database extraction.
- Static analysis rules.
- Diagram model generation.
- Documentation generation.

## Integration tests

Test:
- Complete repository scan.
- Incremental analysis.
- SQLite persistence.
- Search.
- Source navigation.
- Document revision handling.
- Export pipeline.

## End-to-end tests

Test:
- Open a project.
- Complete an analysis.
- Inspect a file.
- Navigate from a diagram to source.
- Inspect a function relationship.
- Generate documentation.
- Edit and export an ADR.
- Restart and reopen a project.

## Golden fixtures

Maintain real, version-controlled sample projects with known expected results.

Compare:
- Symbol counts.
- Dependency relationships.
- API inventories.
- Database entities.
- Diagram graph structures.
- Generated documentation structure.

Do not judge analysis quality solely by an LLM's subjective assessment.

---

# 14. Development Roadmap

## Phase 0 — Product foundation

Deliver:
- Final product scope.
- UX wireframes.
- Design tokens.
- Repository structure.
- Technical architecture.
- Data model.
- Engineering standards.

Exit condition: Core architecture and UX decisions documented and reviewed.

## Phase 1 — Desktop foundation

Deliver:
- Tauri application.
- React frontend.
- Rust backend.
- Project workspace.
- File explorer.
- SQLite persistence.
- Application settings.
- Dark and light themes.

Exit condition: Users can open, save, and reopen projects.

## Phase 2 — Core analysis engine

Deliver:
- File scanning.
- Ignore rules.
- Language detection.
- Parser integration.
- Symbol extraction.
- Import graph.
- Search index.
- Incremental analysis.

Exit condition: BuildBuddy can produce a reliable structured representation of supported projects.

## Phase 3 — Project intelligence

Deliver:
- Function analysis.
- Class analysis.
- API extraction.
- Database extraction.
- Dependency analysis.
- Entry-point detection.
- Static analysis.
- Findings inventory.

Exit condition: Users can inspect a project beyond its directory structure.

## Phase 4 — Diagramming engine

Deliver:
- Architecture diagrams.
- Dependency graphs.
- Call graphs.
- Class diagrams.
- ER diagrams.
- Sequence diagrams where traceable.
- Interactive exploration.
- Export.

Exit condition: Diagrams are readable, accurate, navigable, and connected to source evidence.

## Phase 5 — Documentation engine

Deliver:
- Project overview.
- HLD.
- LLD.
- ADRs.
- API documentation.
- Database documentation.
- Security reports.
- Technical debt reports.
- Markdown editor.
- Revision management.
- Export.

Exit condition: Generated documents are useful without requiring an LLM.

## Phase 6 — Local intelligence

Deliver:
- Optional model manager.
- Local runtime integration.
- Project-aware retrieval.
- Natural-language questions.
- Contextual explanations.
- Evidence-linked answers.
- Documentation prose enhancement.

Exit condition: Local AI adds useful interpretation without changing the factual analysis layer.

## Phase 7 — Hardening and release

Deliver:
- Performance optimization.
- Security review.
- Windows packaging.
- macOS packaging.
- Installer and update strategy.
- Offline installation validation.
- Regression testing.
- Documentation and onboarding.

Exit condition: Release candidates pass the supported platform test matrix.

---

# 15. MVP Scope

Do not attempt to implement every advanced feature in the first release.

The first usable version should include:

1. Project folder selection.
2. Repository explorer.
3. Language and framework detection.
4. Symbol extraction.
5. Import and dependency graph.
6. Function and class inspection.
7. Architecture overview.
8. Interactive dependency diagram.
9. Project overview documentation.
10. HLD generation.
11. LLD generation for supported languages.
12. ADR creation and editing.
13. Markdown export.
14. SQLite persistence.
15. Fully offline core analysis.

Prioritize a small number of supported languages with high-quality analysis over superficial support for twenty languages.

---

# 16. Success Metrics

Measure product usefulness through concrete outcomes.

- Percentage of supported files parsed successfully.
- Accuracy of symbol extraction.
- Accuracy of dependency edges.
- API extraction precision and recall.
- Database relationship accuracy.
- Percentage of findings with source evidence.
- Diagram readability in user evaluations.
- Documentation edit rate.
- Time required to understand an unfamiliar project.
- Time required to locate a specific implementation.
- Analysis completion and crash rates.
- Percentage of core workflows that work offline.

Avoid using an arbitrary "90% understanding" badge without a defined evaluation methodology.

Confidence should be measured per analysis capability and language.

---

# 17. Key Product Decisions

The following decisions are recommended:

| Decision | Recommendation |
|---|---|
| Desktop framework | Tauri 2 |
| Application architecture | Rust core + React frontend |
| Primary database | SQLite |
| Search | FTS5 |
| Parsing | Tree-sitter + language-specific adapters |
| Graph rendering | React Flow / XYFlow |
| Graph layout | ELK.js |
| Documentation | Markdown-first |
| AI | Optional local inference |
| Cloud dependency | None |
| Source modification | Disabled by default |
| Primary UI | Engineering workbench |
| Diagram quality | First-class feature |
| Documentation voice | Natural engineering writing |

---

# 18. Non-Goals

The initial product is not intended to:

- Replace an IDE.
- Automatically rewrite an entire repository.
- Guarantee complete semantic understanding of every language.
- Execute arbitrary project code during static analysis.
- Replace dedicated penetration-testing tools.
- Generate fictional architecture decisions.
- Require cloud accounts.
- Require AI to produce useful documentation.
- Present speculative findings as confirmed facts.

---

# 19. Definition of Done

A feature is not complete merely because its interface exists.

Every feature must have:

- Defined requirements.
- Data model.
- Implementation.
- Error handling.
- Tests.
- Performance consideration.
- Accessibility consideration.
- Documentation.
- Source evidence where applicable.

For diagrams:
- Correct relationships.
- Readable layout.
- Interactive source navigation.
- Export.
- Large-project behavior.

For documentation:
- Accurate content.
- Natural technical writing.
- Source references.
- Editable output.
- Revision handling.
- Export.

For analysis:
- Deterministic behavior where possible.
- Explicit unsupported cases.
- Reproducible results.
- Clear confidence and evidence.

---

# Final Product Direction

BuildBuddy should be the place developers open when they look at a project and think:

"I built this, but I don't fully understand what is happening anymore."

It should turn that uncertainty into a structured understanding of the software.

The product's strongest differentiators should be:

1. Reliable project analysis without AI.
2. High-quality, interactive architecture diagrams.
3. File-to-function-to-system traceability.
4. Engineering documentation that feels human-written.
5. Completely local project intelligence.
6. A professional interface that feels like a serious developer tool.

**BuildBuddy is not about generating more code. It is about understanding the code that already exists.**