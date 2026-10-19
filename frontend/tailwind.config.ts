import type { Config } from "tailwindcss";

export default {
  darkMode: 'class',
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--im-bg)",
        foreground: "var(--im-text)",
        im: {
          primary: "var(--im-primary)",
          "primary-deep": "var(--im-primary-deep)",
          "accent-tint": "var(--im-accent-tint)",
          secondary: "var(--im-secondary)",
          heading: "var(--im-heading)",
          text: "var(--im-text)",
          "text-muted": "var(--im-text-muted)",
          bg: "var(--im-bg)",
          "bg-soft": "var(--im-bg-soft)",
          surface: "var(--im-surface)",
          border: "var(--im-border)",
          "on-dark": "var(--im-on-dark)",
        },
        primary: {
          DEFAULT: "var(--im-primary)",
          hover: "var(--im-primary-deep)",
          dark: "var(--im-primary-deep)"
        },
        accent: {
          DEFAULT: "var(--im-primary)",
          hover: "var(--im-primary-deep)"
        }
      },
      borderRadius: {
        'im-sm': 'var(--im-radius-sm)',
        'im-md': 'var(--im-radius-md)',
        'im-lg': 'var(--im-radius-lg)',
        'im-pill': 'var(--im-radius-pill)',
      },
      boxShadow: {
        'im-sm': 'var(--im-shadow-sm)',
        'im-md': 'var(--im-shadow-md)',
        'im-lg': 'var(--im-shadow-lg)',
      },
      fontFamily: {
        sans: ['var(--im-font-body)', '"IBM Plex Sans"', 'sans-serif'],
        heading: ['var(--im-font-heading)', '"IBM Plex Sans"', 'sans-serif'],
      }
    },
  },
  plugins: [],
} satisfies Config;
