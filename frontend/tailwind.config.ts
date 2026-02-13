import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Manrope", "system-ui", "sans-serif"],
      },
      colors: {
        "tg-bg": "var(--tg-theme-bg-color)",
        "tg-text": "var(--tg-theme-text-color)",
        "tg-hint": "var(--tg-theme-hint-color)",
        "tg-link": "var(--tg-theme-link-color)",
        "tg-button": "var(--tg-theme-button-color)",
        "tg-button-text": "var(--tg-theme-button-text-color)",
        "tg-secondary-bg": "var(--tg-theme-secondary-bg-color)",
        "soft-blue": "#5B9EFF",
        "soft-green": "#4ADE80",
        "soft-purple": "#A78BFA",
        "soft-orange": "#FB923C",
        "soft-pink": "#F472B6",
        "icon-muted": "#94A3B8",
      },
      borderRadius: {
        "2xl": "1.25rem",
        "3xl": "1.5rem",
      },
    },
  },
  plugins: [],
};

export default config;
