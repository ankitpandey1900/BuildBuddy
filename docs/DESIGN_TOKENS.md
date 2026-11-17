# BuildBuddy Design Tokens & Visual Specification

**Status:** Approved Visual System  
**Reference:** PRD.md Section 7.5, AGENTS.md  
**Visual Style:** Native Engineering Workbench (Linear restraint, macOS / Windows 11 system apps)

---

## 1. Core Principles

1. **Native & Restrained:** Surfaces feel like first-class desktop system software (macOS & Windows 11). No AI themes, glowing borders, neon gradients, sparkles, or AI badges.
2. **Soft Elevation on Floating Layers Only:** Menus, popovers, dropdowns, command palette, and inspector overlays use soft elevation shadows. Base views remain flat with 1px hairline separators.
3. **Information Hierarchy:** Clean system typography, generous micro-spacing (4px grid), and muted semantic accents.
4. **Dual Theme First-Class Support:** Light and dark themes maintain identical contrast ratios and semantic mappings (WCAG AA compliant). Dark mode is built from layered charcoal/slate surfaces, never pure black (`#000000`).
5. **Monospace Discipline:** Monospace is reserved strictly for code snippets, file paths, line numbers, and hashes. Monospace is never used for general UI labels, buttons, or uppercase metadata.

---

## 2. Typography System

### 2.1 Font Stacks
* **System UI Font:** `"Segoe UI Variable"`, `"SF Pro"`, `-apple-system`, `BlinkMacSystemFont`, `system-ui`, `"Segoe UI"`, `sans-serif`
* **Code & Monospace Font:** `"SF Mono"`, `"Cascadia Code"`, `Consolas`, `Menlo`, `Monaco`, `monospace`

### 2.2 Type Scale

| Scale | Size | Line Height | Weight | Typical Usage |
|---|---|---|---|---|
| **Micro / Caption** | 11px | 16px | 400 / 500 | Badges, keyboard shortcuts (`Kbd`), status indicators |
| **Secondary / Meta**| 12px | 16px | 400 / 500 | Secondary descriptions, file metadata, helper text |
| **Body (Base)**     | 13px | 18px | 400 / 500 | Primary interface text, table cells, form inputs, buttons |
| **Subheading**      | 15px | 22px | 500 / 600 | Section titles, panel headers, modal headers |
| **Heading**         | 20px | 26px | 600 | Screen headings, overview summaries |
| **Display**         | 28px | 34px | 600 | Welcome view title, primary metrics |

---

## 3. Spacing Grid & Border Radii

### 3.1 4px Spacing Grid
* All padding, margins, and gaps are multiples of 4px: `4px` (1), `8px` (2), `12px` (3), `16px` (4), `20px` (5), `24px` (6), `32px` (8).

### 3.2 Border Radii
* **Small (`6px`):** Buttons, inputs, segmented controls, badges, chips, toolbar items.
* **Medium (`10px`):** Cards, dialog containers, node cards, dropdown menus.
* **Large (`14px`):** Command palette, floating modal dialogs, large containers.

---

## 4. Color Palette & Surface Tokens

### 4.1 Surface Tokens (3 Layered Levels)

| Token | CSS Variable | Dark Theme | Light Theme | Usage |
|---|---|---|---|---|
| **Canvas** | `--bg-canvas` | `#12151A` | `#F6F7F9` | Lowest base window background |
| **Surface** | `--bg-surface` | `#181C23` | `#FFFFFF` | Primary application panels, cards, sidebar |
| **Elevated** | `--bg-elevated` | `#222731` | `#F0F2F5` | Secondary containers, inputs, table headers |
| **Hover** | `--bg-hover` | `rgba(255, 255, 255, 0.05)` | `rgba(0, 0, 0, 0.04)` | Hover on interactive rows, buttons |
| **Active / Pressed** | `--bg-active` | `rgba(255, 255, 255, 0.09)` | `rgba(0, 0, 0, 0.07)` | Pressed buttons, active selection pills |

### 4.2 Text Tokens

| Token | CSS Variable | Dark Theme | Light Theme | Usage |
|---|---|---|---|---|
| **Primary** | `--text-primary` | `#F0F3F6` | `#191C21` | Headings, primary text, active items |
| **Secondary** | `--text-secondary` | `#BAC2CC` | `#4B535E` | Body text, labels, descriptions |
| **Muted** | `--text-muted` | `#7D8794` | `#6E7783` | Metadata, line numbers, disabled items |
| **Faint** | `--text-faint` | `#4C5562` | `#9AA2AD` | Inactive icons, subtle grid marks |

### 4.3 Borders & Hairlines

| Token | CSS Variable | Dark Theme | Light Theme | Usage |
|---|---|---|---|---|
| **Border Subtle** | `--border-subtle` | `rgba(255, 255, 255, 0.07)` | `rgba(0, 0, 0, 0.06)` | Table dividers, list dividers |
| **Border Default**| `--border-default`| `rgba(255, 255, 255, 0.12)` | `rgba(0, 0, 0, 0.12)` | Panel boundaries, cards, controls |
| **Border Strong** | `--border-strong` | `rgba(255, 255, 255, 0.22)` | `rgba(0, 0, 0, 0.22)` | Input active borders, hover states |
| **Border Focus**  | `--border-focus`  | `#3B82F6` | `#2563EB` | 2px focus ring on `:focus-visible` only |

### 4.4 Accent Color (Single Primary)

| Token | CSS Variable | Dark Theme | Light Theme | Usage |
|---|---|---|---|---|
| **Accent Default**| `--accent-default`| `#3B82F6` | `#2563EB` | Primary buttons, active indicators |
| **Accent Hover**  | `--accent-hover`  | `#60A5FA` | `#1D4ED8` | Primary button hover |
| **Accent Subtle** | `--accent-subtle` | `rgba(59, 130, 246, 0.14)` | `rgba(37, 99, 235, 0.10)` | Selected sidebar pills, active tags |
| **Accent Text**   | `--accent-text`   | `#60A5FA` | `#2563EB` | Active nav link text, highlights |

### 4.5 Semantic Status Colors (Used Sparingly)

| Semantic | Dark Tint (Bg) | Dark Foreground | Light Tint (Bg) | Light Foreground |
|---|---|---|---|---|
| **Success** | `rgba(34, 197, 94, 0.14)` | `#4ADE80` | `rgba(22, 163, 74, 0.10)` | `#16A34A` |
| **Warning** | `rgba(234, 179, 8, 0.14)` | `#FACC15` | `rgba(202, 138, 4, 0.10)` | `#CA8A04` |
| **Danger**  | `rgba(239, 68, 68, 0.14)` | `#F87171` | `rgba(220, 38, 38, 0.10)` | `#DC2626` |
| **Info**    | `rgba(59, 130, 246, 0.14)` | `#60A5FA` | `rgba(37, 99, 235, 0.10)` | `#2563EB` |

### 4.6 Desaturated Architecture Layer Tints

| Layer | Dark Accent | Dark Background | Light Accent | Light Background |
|---|---|---|---|---|
| **Frontend** | `#60A5FA` | `rgba(59, 130, 246, 0.12)` | `#2563EB` | `rgba(37, 99, 235, 0.08)` |
| **Backend**  | `#34D399` | `rgba(16, 185, 129, 0.12)` | `#059669` | `rgba(5, 150, 105, 0.08)` |
| **Data**     | `#FBBF24` | `rgba(245, 158, 11, 0.12)` | `#D97706` | `rgba(217, 119, 6, 0.08)` |
| **Shared**   | `#A78BFA` | `rgba(139, 92, 246, 0.12)` | `#7C3AED` | `rgba(124, 58, 237, 0.08)` |
| **Config**   | `#94A3B8` | `rgba(100, 116, 139, 0.12)`| `#475569` | `rgba(71, 85, 105, 0.08)` |
| **External** | `#F472B6` | `rgba(236, 72, 153, 0.12)` | `#DB2777` | `rgba(219, 39, 119, 0.08)` |

---

## 5. Focus & Interactive States

* **Focus Ring:** `2px solid var(--border-focus)` on `:focus-visible` only, with `outline-offset: 1px`. Regular mouse clicks produce no outline.
* **Hover State:** Subtly lightens or darkens with `var(--bg-hover)`.
* **Pressed State:** Feedback with `var(--bg-active)`.
* **Motion:** `150ms ease-out` standard transition on opacity and color. Disabled under `@media (prefers-reduced-motion: reduce)`.
* **Floating Shadows:** Soft multi-stop shadows for floating layers only:
  * Dropdowns / Popovers: `0 8px 24px -4px rgba(0, 0, 0, 0.28), 0 2px 6px -1px rgba(0, 0, 0, 0.16)`
  * Command Palette / Modals: `0 16px 40px -8px rgba(0, 0, 0, 0.38), 0 4px 12px -2px rgba(0, 0, 0, 0.2)`
