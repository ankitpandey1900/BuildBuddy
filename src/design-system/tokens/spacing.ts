/**
 * BuildBuddy Design System - Spacing & Elevation Tokens
 * Strict 4px spacing grid. Flat workspace surfaces with controlled elevations.
 */

export const spacing = {
  grid: 4,
  radius: {
    sm: "6px",
    md: "10px",
    lg: "14px",
    full: "9999px",
  },
  borderWidth: {
    default: "1px",
    thick: "2px",
  },
  shadow: {
    none: "none",
    menu: "0 8px 24px -4px rgba(0, 0, 0, 0.45), 0 2px 6px -1px rgba(0, 0, 0, 0.25)",
    modal: "0 16px 40px -8px rgba(0, 0, 0, 0.6), 0 4px 12px -2px rgba(0, 0, 0, 0.35)",
  },
  panel: {
    sidebarWidth: 240,
    sidebarCollapsedWidth: 56,
    inspectorDefaultWidth: 340,
    inspectorMinWidth: 260,
    inspectorMaxWidth: 600,
    topBarHeight: 48,
    statusBarHeight: 24,
  },
} as const;
