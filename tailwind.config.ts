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
        subtle: "var(--bg-subtle)",
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
          external: {
            bg: "var(--domain-external-bg)",
            border: "var(--domain-external-border)",
          },
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          '"Segoe UI"',
          "Roboto",
          "sans-serif",
        ],
        mono: [
          '"JetBrains Mono"',
          '"Fira Code"',
          "Menlo",
          "Monaco",
          "Consolas",
          "monospace",
        ],
      },
      fontSize: {
        micro: ["10px", { lineHeight: "14px" }],
        caption: ["11px", { lineHeight: "16px" }],
        meta: ["12px", { lineHeight: "16px" }],
        body: ["13px", { lineHeight: "18px" }],
        "body-md": ["14px", { lineHeight: "20px" }],
        subheading: ["15px", { lineHeight: "22px" }],
        heading: ["18px", { lineHeight: "24px" }],
        title: ["22px", { lineHeight: "28px" }],
      },
      borderRadius: {
        none: "0px",
        sm: "2px",
        md: "4px",
        lg: "6px",
      },
    },
  },
  plugins: [],
};

export default config;

