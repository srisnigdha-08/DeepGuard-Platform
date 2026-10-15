/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Design tokens — change here, updates everywhere
        surface: {
          DEFAULT: "#0f1117",
          50:      "#1a1d27",
          100:     "#1e2130",
          200:     "#252a3a",
          300:     "#2d3348",
        },
        primary: { 400: "#818cf8", 500: "#6366f1", 600: "#4f46e5" },
        danger:  { DEFAULT: "#ef4444" },
        success: { DEFAULT: "#22c55e" },
        warning: { DEFAULT: "#f59e0b" },
        text: {
          primary:   "#f1f5f9",
          secondary: "#94a3b8",
          muted:     "#64748b",
        },
        accent: { cyan: "#22d3ee", purple: "#a78bfa" },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      fontSize: {
        "2xs": ["0.625rem", { lineHeight: "0.75rem" }],
      },
      boxShadow: {
        glass: "0 4px 24px 0 rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)",
        glow:  "0 0 20px rgba(99,102,241,0.25)",
      },
    },
  },
  plugins: [require("@tailwindcss/forms")],
};
