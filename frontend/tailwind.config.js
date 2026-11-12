/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#F8FAFC",
        surface: "#FFFFFF",
        "surface-muted": "#F1F5F9",
        border: "#E2E8F0",
        primary: {
          DEFAULT: "#2563EB",
          hover: "#1D4ED8",
          light: "#EFF6FF",
          border: "#BFDBFE",
        },
        accent: {
          red: "#FF3B30",
          purple: "#7C3AED",
        },
        content: {
          primary: "#0F172A",
          secondary: "#475569",
          muted: "#64748B",
        },
        status: {
          success: "#16A34A",
          warning: "#D97706",
          error: "#DC2626",
          info: "#0284C7",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "Inter", "system-ui", "sans-serif"],
        heading: ["var(--font-space-grotesk)", "Space Grotesk", "sans-serif"],
        mono: ["var(--font-roboto-mono)", "Roboto Mono", "monospace"],
      },
      boxShadow: {
        bento: "0 1px 3px 0 rgba(15, 23, 42, 0.04), 0 1px 2px -1px rgba(15, 23, 42, 0.04)",
        "bento-hover": "0 10px 25px -5px rgba(37, 99, 235, 0.08), 0 8px 10px -6px rgba(15, 23, 42, 0.04)",
      },
      borderRadius: {
        bento: "14px",
      },
    },
  },
  plugins: [],
};
