/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ctm: {
          navy:   "#1e3a5f",
          steel:  "#64748b",
          amber:  "#f59e0b",
          dark:   "#0f1e30",
          light:  "#e8edf4",
        },
      },
      fontFamily: {
        mono: ["JetBrains Mono", "Fira Code", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};
