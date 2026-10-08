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
        background: "var(--background)",
        foreground: "var(--foreground)",
        primary: {
          DEFAULT: "#4ADE80", // Vibrant green matching "Revenue" and the button
          hover: "#22C55E",
          dark: "#16A34A"
        },
        accent: {
          DEFAULT: "#F59E0B", // Vibrant accent
          hover: "#D97706"
        }
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'hero-pattern': 'linear-gradient(to right bottom, #1e3a8a, #3b82f6, #60a5fa)',
      }
    },
  },
  plugins: [],
} satisfies Config;
