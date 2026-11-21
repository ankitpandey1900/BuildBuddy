/**
 * BuildBuddy Design System - Typography Tokens
 * System font stack for crisp rendering across Windows, macOS, and Linux.
 * Monospace reserved strictly for code, hashes, paths, and technical metrics.
 */

export const typography = {
  fontFamily: {
    sans: [
      '"Segoe UI Variable"',
      '"SF Pro"',
      '-apple-system',
      'BlinkMacSystemFont',
      'system-ui',
      '"Segoe UI"',
      'sans-serif',
    ].join(", "),
    mono: [
      '"JetBrains Mono"',
      '"Cascadia Code"',
      '"SF Mono"',
      'Menlo',
      'Consolas',
      'monospace',
    ].join(", "),
  },

  fontSize: {
    micro: ["11px", { lineHeight: "14px", letterSpacing: "0.01em" }],
    caption: ["12px", { lineHeight: "16px", letterSpacing: "0.005em" }],
    body: ["13px", { lineHeight: "18px", letterSpacing: "0" }],
    subheading: ["15px", { lineHeight: "20px", letterSpacing: "-0.01em" }],
    heading: ["20px", { lineHeight: "26px", letterSpacing: "-0.015em" }],
    display: ["28px", { lineHeight: "34px", letterSpacing: "-0.02em" }],
  },

  fontWeight: {
    normal: "400",
    medium: "500",
    semibold: "600",
  },
} as const;
