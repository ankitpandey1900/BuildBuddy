/**
 * BuildBuddy Design System - Color Tokens
 * Apple-inspired minimalism and engineering restraint.
 * Dark Mode: Graphite (#111214, #17191C, #1D2024, #30343A, #F5F5F7)
 * Light Mode: Clean Paper (#F5F5F7, #FFFFFF, #E5E5EA, #1D1D1F)
 * Primary Accent: Apple System Blue (#0A84FF / #007AFF)
 */

export const colors = {
  // Dark mode surfaces (Absolute Dark OLED / Tallymate)
  dark: {
    canvas: "#0C0C0E",       // Main background
    surface: "#141416",      // Secondary background (cards, sidebars)
    elevated: "#1E1E22",     // Elevated surface (dropdowns, popovers)
    subtle: "#1E1E22",       // Input surface / insets
    hover: "#1C1C1F",
    active: "#27272A",

    text: {
      primary: "#F5F5F7",    // High contrast light
      secondary: "#A1A1AA",  // Readable muted text
      muted: "#71717A",      // Subtle captions and metadata
      faint: "#52525B",      // Inactive borders and hints
    },

    border: {
      subtle: "#1F1F23",     // Inset dividers
      default: "#27272A",    // Standard 1px panel borders
      strong: "#3F3F46",     // Active/hover borders
      focus: "#0A84FF",      // Keyboard focus ring
    },
  },

  // Light mode surfaces (Apple Clarity)
  light: {
    canvas: "#F5F5F7",       // Main background
    surface: "#FFFFFF",      // Primary surface
    elevated: "#FFFFFF",     // Elevated surface
    subtle: "#F0F1F3",       // Secondary surface
    hover: "rgba(0, 0, 0, 0.04)",
    active: "rgba(0, 0, 0, 0.07)",

    text: {
      primary: "#1D1D1F",    // High contrast primary text
      secondary: "#6E6E73",  // Muted secondary text
      muted: "#8E8E93",      // Metadata and captions
      faint: "#AEAEB2",      // Inactive hints
    },

    border: {
      subtle: "#EFEFF4",     // Subtle dividers
      default: "#E5E5EA",    // Standard 1px borders
      strong: "#D1D1D6",     // Hover/active borders
      focus: "#007AFF",      // Keyboard focus ring
    },
  },

  // Primary Accent (Apple System Blue, used with discipline)
  accent: {
    default: "#0A84FF",
    hover: "#0071E3",
    subtle: "rgba(10, 132, 255, 0.12)",
    text: "#0A84FF",
    foreground: "#FFFFFF",
  },

  // Semantic Status Colors (Restrained)
  status: {
    success: {
      bg: "rgba(48, 209, 88, 0.12)",
      text: "#30D158",
      border: "rgba(48, 209, 88, 0.25)",
    },
    warning: {
      bg: "rgba(255, 159, 10, 0.12)",
      text: "#FF9F0A",
      border: "rgba(255, 159, 10, 0.25)",
    },
    danger: {
      bg: "rgba(255, 69, 58, 0.12)",
      text: "#FF453A",
      border: "rgba(255, 69, 58, 0.25)",
    },
    info: {
      bg: "rgba(10, 132, 255, 0.12)",
      text: "#0A84FF",
      border: "rgba(10, 132, 255, 0.25)",
    },
  },

  // Architectural Layer Colors (Muted, subtle)
  domain: {
    frontend: {
      bg: "rgba(10, 132, 255, 0.08)",
      border: "#0A84FF",
      text: "#0A84FF",
    },
    backend: {
      bg: "rgba(94, 92, 230, 0.08)",
      border: "#5E5CE6",
      text: "#5E5CE6",
    },
    database: {
      bg: "rgba(48, 209, 88, 0.08)",
      border: "#30D158",
      text: "#30D158",
    },
    shared: {
      bg: "rgba(255, 159, 10, 0.08)",
      border: "#FF9F0A",
      text: "#FF9F0A",
    },
    config: {
      bg: "rgba(191, 90, 242, 0.08)",
      border: "#BF5AF2",
      text: "#BF5AF2",
    },
    external: {
      bg: "rgba(142, 142, 147, 0.08)",
      border: "#8E8E93",
      text: "#8E8E93",
    },
  },

  // Provenance Confidence Tokens
  confidence: {
    confirmed: {
      bg: "rgba(48, 209, 88, 0.12)",
      text: "#30D158",
      border: "rgba(48, 209, 88, 0.25)",
    },
    static: {
      bg: "rgba(10, 132, 255, 0.12)",
      text: "#0A84FF",
      border: "rgba(10, 132, 255, 0.25)",
    },
    inferred: {
      bg: "rgba(255, 159, 10, 0.12)",
      text: "#FF9F0A",
      border: "rgba(255, 159, 10, 0.25)",
    },
    unknown: {
      bg: "rgba(142, 142, 147, 0.12)",
      text: "#8E8E93",
      border: "rgba(142, 142, 147, 0.25)",
    },
  },
} as const;
