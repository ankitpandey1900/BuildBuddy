import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: ["class", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        canvas: "var(--bg-canvas)",
        surface: "var(--bg-surface)",
        subtle: "var(--bg-subtle, var(--bg-elevated))",
        elevated: "var(--bg-elevated)",
        hover: "var(--bg-hover)",
        active: "var(--bg-active)",
        
        "text-primary": "var(--text-primary)",
        "text-secondary": "var(--text-secondary)",
        "text-muted": "var(--text-muted)",
        "text-faint": "var(--text-faint)",
        
        "border-subtle": "var(--border-subtle)",
        "border-default": "var(--border-default)",
        "border-strong": "var(--border-strong)",
        "border-focus": "var(--border-focus)",
        
        accent: {
          DEFAULT: "var(--accent-default)",
          hover: "var(--accent-hover)",
          subtle: "var(--accent-subtle)",
          text: "var(--accent-text)",
        },
        
        status: {
          success: {
            bg: "var(--status-success-bg)",
            text: "var(--status-success-text)",
          },
          warning: {
            bg: "var(--status-warning-bg)",
            text: "var(--status-warning-text)",
          },
          danger: {
            bg: "var(--status-danger-bg)",
            text: "var(--status-danger-text)",
          },
        },

        domain: {
          frontend: {
            bg: "var(--domain-frontend-bg)",
            border: "var(--domain-frontend-border)",
          },
          backend: {
            bg: "var(--domain-backend-bg)",
            border: "var(--domain-backend-border)",
          },
          database: {
            bg: "var(--domain-database-bg)",
            border: "var(--domain-database-border)",
          },
          shared: {
            bg: "var(--domain-shared-bg)",
            border: "var(--domain-shared-border)",
          },
          config: {
            bg: "var(--domain-config-bg)",
            border: "var(--domain-config-border)",
          },
          external: {
            bg: "var(--domain-external-bg)",
            border: "var(--domain-external-border)",
          },
        },
      },
      fontFamily: {
        sans: [
          '"Segoe UI Variable"',
          '"SF Pro"',
          "-apple-system",
          "BlinkMacSystemFont",
          "system-ui",
          '"Segoe UI"',
          "sans-serif",
        ],
        mono: [
          '"SF Mono"',
          '"Cascadia Code"',
          "Consolas",
          "Menlo",
          "Monaco",
          "monospace",
        ],
      },
      fontSize: {
        micro: ["11px", { lineHeight: "16px" }],
        caption: ["11px", { lineHeight: "16px" }],
        meta: ["12px", { lineHeight: "16px" }],
        body: ["13px", { lineHeight: "18px" }],
        "body-md": ["13px", { lineHeight: "18px" }],
        subheading: ["15px", { lineHeight: "22px" }],
        heading: ["20px", { lineHeight: "26px" }],
        title: ["20px", { lineHeight: "26px" }],
        display: ["28px", { lineHeight: "34px" }],
      },
      borderRadius: {
        none: "0px",
        sm: "6px",
        md: "10px",
        lg: "14px",
      },
      boxShadow: {
        menu: "var(--shadow-menu)",
        modal: "var(--shadow-modal)",
      },
      transitionDuration: {
        DEFAULT: "150ms",
      },
      transitionTimingFunction: {
        DEFAULT: "cubic-bezier(0, 0, 0.2, 1)",
      },
    },
  },
  plugins: [],
};

export default config;
