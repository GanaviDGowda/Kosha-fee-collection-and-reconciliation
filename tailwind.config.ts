import type { Config } from "tailwindcss";

// Tokens are CSS variables in app/globals.css. The scales below replace Tailwind's defaults
// on purpose, so only the design system's sizes, radii and shadows exist.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    fontFamily: {
      sans: ['"IBM Plex Sans"', "ui-sans-serif", "system-ui", "sans-serif"],
      mono: ['"IBM Plex Mono"', "ui-monospace", "SFMono-Regular", "monospace"],
    },
    // 12 / 13 / 14 (body) / 16 / 20 / 28 / 36
    fontSize: {
      xs: ["12px", { lineHeight: "16px" }],
      sm: ["13px", { lineHeight: "18px" }],
      base: ["14px", { lineHeight: "20px" }],
      md: ["16px", { lineHeight: "24px" }],
      lg: ["20px", { lineHeight: "28px" }],
      xl: ["28px", { lineHeight: "36px" }],
      "2xl": ["36px", { lineHeight: "44px" }],
    },
    fontWeight: { normal: "400", medium: "500", semibold: "600" },
    borderRadius: {
      none: "0",
      sm: "4px",
      DEFAULT: "6px", // inputs and buttons
      panel: "10px", // panels, tables, drawers
      full: "9999px", // status badges only
    },
    boxShadow: {
      none: "none",
      // Overlays only: drawer, popover, command palette. Panels use borders.
      overlay: "0 16px 40px rgba(22, 33, 58, 0.16), 0 2px 8px rgba(22, 33, 58, 0.08)",
    },
    extend: {
      colors: {
        canvas: "rgb(var(--canvas-rgb) / <alpha-value>)",
        surface: "rgb(var(--surface-rgb) / <alpha-value>)",
        ink: "rgb(var(--ink-rgb) / <alpha-value>)",
        muted: "rgb(var(--muted-rgb) / <alpha-value>)",
        line: "rgb(var(--line-rgb) / <alpha-value>)",
        "line-strong": "rgb(var(--line-strong-rgb) / <alpha-value>)",
        accent: "rgb(var(--accent-rgb) / <alpha-value>)",
        credit: "rgb(var(--credit-rgb) / <alpha-value>)",
        pending: "rgb(var(--pending-rgb) / <alpha-value>)",
        debit: "rgb(var(--debit-rgb) / <alpha-value>)",
        reversed: "rgb(var(--reversed-rgb) / <alpha-value>)",
      },
      maxWidth: { content: "1280px" },
      width: { sidebar: "var(--sidebar-width)" },
      height: { topbar: "var(--topbar-height)" },
      keyframes: {
        "sheet-in": { from: { transform: "translateX(100%)" }, to: { transform: "translateX(0)" } },
        "sheet-out": { from: { transform: "translateX(0)" }, to: { transform: "translateX(100%)" } },
        "sheet-left-in": { from: { transform: "translateX(-100%)" }, to: { transform: "translateX(0)" } },
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "fade-out": { from: { opacity: "1" }, to: { opacity: "0" } },
        "toast-in": { from: { transform: "translateY(8px)", opacity: "0" }, to: { transform: "translateY(0)", opacity: "1" } },
        "pop-in": { from: { transform: "scale(0.98)", opacity: "0" }, to: { transform: "scale(1)", opacity: "1" } },
      },
      animation: {
        "sheet-in": "sheet-in 220ms cubic-bezier(0.2, 0.8, 0.2, 1)",
        "sheet-out": "sheet-out 180ms ease-in",
        "sheet-left-in": "sheet-left-in 220ms cubic-bezier(0.2, 0.8, 0.2, 1)",
        "fade-in": "fade-in 180ms ease-out",
        "fade-out": "fade-out 150ms ease-in",
        "toast-in": "toast-in 200ms ease-out",
        "pop-in": "pop-in 140ms ease-out",
      },
    },
  },
  plugins: [],
};

export default config;
