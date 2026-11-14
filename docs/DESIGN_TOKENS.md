# BuildBuddy Design Tokens & Visual Specification

**Status:** Approved Visual System  
**Reference:** [PRD.md Sections 7.5 & 8.7](file:///d:/Projects/Vibe%20Code/13_BuildBuddy/docs/PRD.md#L705-L730), [Agents.md Rule 4](file:///d:/Projects/Vibe%20Code/13_BuildBuddy/Agents.md#L14-L16)  
**Visual Style:** Professional Engineering Workbench (Linear consistency, JetBrains density, VS Code utility, DataGrip inspection)

---

## 1. Design Principles

1. **No AI Aesthetic:** No neon gradients, glowing borders, purple/blue AI badges, floating chatbot widgets, or decorative background animations.
2. **Restrained Engineering Palette:** Neutral slate/gray tones form 90% of the visual field. Colors communicate semantic architectural meaning, not decoration.
3. **Information Density & Hierarchy:** Information is structured through thin 1px borders, subtle surface elevations, and monospace metadata rather than large cards or excessive padding.
4. **Dual Theme First-Class Support:** Light and dark themes maintain identical contrast ratios and semantic mappings (WCAG AA compliant).

---

## 2. Color Palette & Semantic Tokens

All colors are defined as CSS custom properties with values provided for both Dark (default) and Light themes.

### 2.1 Surface & Background Tokens

| Token Name | CSS Variable | Dark Theme (Hex) | Light Theme (Hex) | Usage |
|---|---|---|---|---|
| `bg-canvas` | `--bg-canvas` | `#0D1117` | `#F6F8FA` | Base application background behind all panels |
| `bg-surface` | `--bg-surface` | `#161B22` | `#FFFFFF` | Primary panel surface (Explorer, Inspector, Tables) |
| `bg-subtle` | `--bg-subtle` | `#21262D` | `#F0F2F5` | Secondary container, code block gutter, inactive tab |
| `bg-elevated` | `--bg-elevated` | `#30363D` | `#E1E4E8` | Dropdown menus, tooltips, dialogs |
| `bg-hover` | `--bg-hover` | `rgba(255, 255, 255, 0.06)` | `rgba(0, 0, 0, 0.04)` | Interactive row/item hover state |
| `bg-active` | `--bg-active` | `rgba(255, 255, 255, 0.10)` | `rgba(0, 0, 0, 0.08)` | Selected file tree row, active tab background |

### 2.2 Text & Foreground Tokens

| Token Name | CSS Variable | Dark Theme (Hex) | Light Theme (Hex) | Usage |
|---|---|---|---|---|
| `text-primary` | `--text-primary` | `#F0F6FC` | `#1F2328` | Primary headings, code text, active labels |
| `text-secondary` | `--text-secondary` | `#C9D1D9` | `#424A53` | Standard body text, parameter names, properties |
| `text-muted` | `--text-muted` | `#8B949E` | `#656D76` | Line numbers, file extensions, breadcrumbs |
| `text-faint` | `--text-faint` | `#484F58` | `#8C959F` | Inactive icons, subtle table column dividers |

### 2.3 Border & Divider Tokens

| Token Name | CSS Variable | Dark Theme (Hex) | Light Theme (Hex) | Usage |
|---|---|---|---|---|
| `border-subtle` | `--border-subtle` | `#21262D` | `#E1E4E8` | Table row dividers, split pane separators |
| `border-default` | `--border-default` | `#30363D` | `#D0D7DE` | Panel borders, top navigation boundary, cards |
| `border-strong` | `--border-strong` | `#6E7681` | `#8C959F` | Input field borders, active tab indicator |
| `border-focus` | `--border-focus` | `#58A6FF` | `#0969DA` | Keyboard focus ring (2px solid outline) |

### 2.4 Brand & Selection Accent Tokens

| Token Name | CSS Variable | Dark Theme (Hex) | Light Theme (Hex) | Usage |
|---|---|---|---|---|
| `accent-default` | `--accent-default` | `#388BFD` | `#0969DA` | Primary buttons, active selection highlight |
| `accent-hover` | `--accent-hover` | `#58A6FF` | `#1A7F37` | Hovered primary action |
| `accent-subtle` | `--accent-subtle` | `rgba(56, 139, 253, 0.15)` | `rgba(9, 105, 218, 0.10)` | Active navigation pill background |
| `accent-text` | `--accent-text` | `#79C0FF` | `#0969DA` | Highlighted symbol text, active breadcrumb |

### 2.5 Status & Health Tokens

| Status | Dark Bg | Dark Text / Border | Light Bg | Light Text / Border | Usage |
|---|---|---|---|---|---|
| **Success** | `rgba(46, 160, 67, 0.15)` | `#3FB950` | `rgba(26, 127, 55, 0.12)` | `#1A7F37` | Scan complete, zero errors |
| **Warning** | `rgba(210, 153, 34, 0.15)` | `#D29922` | `rgba(154, 103, 0, 0.12)` | `#9A6700` | Deprecation, high complexity |
| **Error** | `rgba(248, 81, 73, 0.15)` | `#F85149` | `rgba(207, 34, 46, 0.12)` | `#CF222E` | Parse failure, broken import |
| **Info** | `rgba(56, 139, 253, 0.15)` | `#58A6FF` | `rgba(9, 105, 218, 0.12)` | `#0969DA` | Informational finding |

### 2.6 Domain Architectural Tokens (PRD Section 7.5)

These tokens provide consistent semantic coloring across architecture diagrams, graph nodes, and entity badges:

| Architectural Domain | Dark Base Fill | Dark Border & Label | Light Base Fill | Light Border & Label | Example Usage |
|---|---|---|---|---|---|
| **Frontend** | `#1C2433` | `#58A6FF` | `#EEF4FF` | `#0969DA` | React components, hooks, web routes |
| **Backend** | `#1A2824` | `#3FB950` | `#EBF8EE` | `#1A7F37` | Controllers, services, HTTP handlers |
| **Database** | `#2B2319` | `#D29922` | `#FFF8E6` | `#9A6700` | ORM entities, SQL tables, repositories |
| **External Service** | `#271F30` | `#BC8CFF` | `#F5EEFF` | `#8250DF` | Stripe, AWS S3, OAuth, 3rd-party APIs |
| **Warning / Debt** | `#321D22` | `#F85149` | `#FFEBE9` | `#CF222E` | Dead code, circular module loops |
| **Selected Node** | `#1F3554` | `#79C0FF` | `#DDF4FF` | `#0969DA` | Active item in graph or tree |

### 2.7 Evidence Confidence Badges (Agents.md Rule 3)

| Confidence Level | Badge Background | Badge Text / Dot | Definition |
|---|---|---|---|
| `confirmed` | `rgba(46, 160, 67, 0.20)` | `#3FB950` | Direct verified AST declaration or explicit import statement |
| `static` | `rgba(56, 139, 253, 0.20)` | `#58A6FF` | Deterministic static analysis calculation / call site match |
| `inferred` | `rgba(210, 153, 34, 0.20)` | `#D29922` | Heuristic match or local intelligence reasoning |
| `unknown` | `rgba(139, 148, 158, 0.20)`| `#8B949E` | Dynamic resolution or unverified runtime edge |

---

## 3. Typography System

### 3.1 Font Stacks
- **UI & Interface Font:** `Inter`, `-apple-system`, `BlinkMacSystemFont`, `"Segoe UI"`, `Helvetica`, `Arial`, `sans-serif`
- **Code & Monospace Font:** `"JetBrains Mono"`, `"Fira Code"`, `Menlo`, `Monaco`, `"Cascadia Code"`, `Consolas`, `monospace`

### 3.2 Type Scale

| Name | Size | Line Height | Weight | Tracking | Usage |
|---|---|---|---|---|---|
| `type-micro` | 10px / 0.625rem | 14px | 500 Medium | +0.02em | Badges, tags, graph edge labels |
| `type-caption` | 11px / 0.6875rem| 16px | 400 Regular | +0.01em | Line numbers, byte sizes, timestamps |
| `type-meta` | 12px / 0.75rem | 16px | 400 / 500 | Normal | Table cells, file tree rows, form labels |
| `type-body` | 13px / 0.8125rem| 18px | 400 Regular | Normal | Standard UI text, inspector descriptions |
| `type-body-md` | 14px / 0.875rem | 20px | 400 / 500 | Normal | Markdown preview prose, modal body text |
| `type-subheading`| 15px / 0.9375rem| 22px | 600 SemiBold| -0.01em | Inspector panel headers, sub-sections |
| `type-heading` | 18px / 1.125rem | 24px | 600 SemiBold| -0.015em| Document section headers (H2), view titles |
| `type-title` | 22px / 1.375rem | 28px | 600 SemiBold| -0.02em | Document titles (H1), overview title |

---

## 4. Spacing, Sizing, and Layout Grid

BuildBuddy is anchored to a strict **4px modular grid**.

### 4.1 Spacing Scale
- `space-1`: `4px`
- `space-2`: `8px`
- `space-3`: `12px`
- `space-4`: `16px`
- `space-5`: `20px`
- `space-6`: `24px`
- `space-8`: `32px`
- `space-10`: `40px`

### 4.2 Structural Layout Dimensions

```text
+------------------------------------------------------------------------------------+
|  TopBar (Height: 40px)                                                             |
+-------+-------------------------+----------------------------------+---------------+
| Nav   | Explorer Tree           | Workspace Canvas                 | Inspector     |
| Rail  | (Width: 260px - 380px)  | (Flexible Main Area)             | Panel         |
|       |                         | - Code Viewer / Table / Graph    | (Width:       |
| 48px  | Resizable Splitter      |                                  | 320px-440px)  |
+-------+-------------------------+----------------------------------+---------------+
|  StatusBar (Height: 24px)                                                          |
+------------------------------------------------------------------------------------+
```

- **Top Application Bar:** Fixed `40px` height.
- **Navigation Rail:** Fixed `48px` width (icon only) or `180px` expanded.
- **Explorer Tree Sidebar:** Default `280px`, min `220px`, max `420px` (user resizable).
- **Right Inspector Panel:** Default `340px`, min `280px`, max `500px` (collapsible & resizable).
- **Status Bar:** Fixed `24px` height.
- **Table Row Height:** Dense `28px` (default) or `32px` (comfortable).
- **Tree Row Height:** Dense `24px`.

---

## 5. Border Radius & Focus Rings

- `radius-none`: `0px` — Used for splitters, canvas, editor gutters, status bar.
- `radius-sm`: `2px` — Used for inline code tags, badge chips, tiny buttons.
- `radius-md`: `4px` — Used for standard buttons, inputs, context menus, tooltips.
- `radius-lg`: `6px` — Used for modal dialogs and diagram nodes.
- **No large rounded pills or bubbly cards** (`rounded-full` is restricted only to status dots).

### Focus Rings
All keyboard-interactive elements utilize an accessible, high-contrast focus ring:
- `focus-ring`: `outline: 2px solid var(--border-focus); outline-offset: 1px;`

---

## 6. CSS Custom Properties Implementation

This standard stylesheet is imported at `src/index.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  /* Dark Theme Default */
  --bg-canvas: #0D1117;
  --bg-surface: #161B22;
  --bg-subtle: #21262D;
  --bg-elevated: #30363D;
  --bg-hover: rgba(255, 255, 255, 0.06);
  --bg-active: rgba(255, 255, 255, 0.10);

  --text-primary: #F0F6FC;
  --text-secondary: #C9D1D9;
  --text-muted: #8B949E;
  --text-faint: #484F58;

  --border-subtle: #21262D;
  --border-default: #30363D;
  --border-strong: #6E7681;
  --border-focus: #58A6FF;

  --accent-default: #388BFD;
  --accent-hover: #58A6FF;
  --accent-subtle: rgba(56, 139, 253, 0.15);
  --accent-text: #79C0FF;

  /* Domain Tokens */
  --domain-frontend-bg: #1C2433;
  --domain-frontend-border: #58A6FF;
  --domain-backend-bg: #1A2824;
  --domain-backend-border: #3FB950;
  --domain-database-bg: #2B2319;
  --domain-database-border: #D29922;
  --domain-external-bg: #271F30;
  --domain-external-border: #BC8CFF;
}

[data-theme='light'] {
  --bg-canvas: #F6F8FA;
  --bg-surface: #FFFFFF;
  --bg-subtle: #F0F2F5;
  --bg-elevated: #E1E4E8;
  --bg-hover: rgba(0, 0, 0, 0.04);
  --bg-active: rgba(0, 0, 0, 0.08);

  --text-primary: #1F2328;
  --text-secondary: #424A53;
  --text-muted: #656D76;
  --text-faint: #8C959F;

  --border-subtle: #E1E4E8;
  --border-default: #D0D7DE;
  --border-strong: #8C959F;
  --border-focus: #0969DA;

  --accent-default: #0969DA;
  --accent-hover: #1A7F37;
  --accent-subtle: rgba(9, 105, 218, 0.10);
  --accent-text: #0969DA;

  /* Domain Tokens */
  --domain-frontend-bg: #EEF4FF;
  --domain-frontend-border: #0969DA;
  --domain-backend-bg: #EBF8EE;
  --domain-backend-border: #1A7F37;
  --domain-database-bg: #FFF8E6;
  --domain-database-border: #9A6700;
  --domain-external-bg: #F5EEFF;
  --domain-external-border: #8250DF;
}
```

