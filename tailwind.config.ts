import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        mayus: {
          bg: "var(--bg)",
          "bg-1": "var(--bg-1)",
          "bg-2": "var(--bg-2)",
          "bg-3": "var(--bg-3)",
          line: "var(--line)",
          "line-strong": "var(--line-strong)",
          gold: "var(--gold)",
          "gold-bright": "var(--gold-bright)",
          "gold-soft": "var(--gold-soft)",
          "gold-dim": "var(--gold-dim)",
          ink: "var(--ink)",
          "ink-1": "var(--ink-1)",
          "ink-2": "var(--ink-2)",
          "ink-3": "var(--ink-3)",
          fatal: "var(--fatal)",
          done: "var(--done)",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      fontFamily: {
        sans: ["var(--font-noto-sans)", "var(--font-inter)", "sans-serif"],
        display: ["var(--type-display)", "Georgia", "serif"],
        title: ["var(--type-title)", "Georgia", "serif"],
        body: ["var(--type-body)", "Georgia", "serif"],
        ui: ["var(--type-ui)", "system-ui", "sans-serif"],
        proc: ["var(--type-proc)", "ui-monospace", "monospace"],
        inter: ["var(--font-inter)", "sans-serif"],
        montserrat: ["var(--font-montserrat)", "sans-serif"],
        cormorant: ["var(--font-cormorant)", "serif"],
        gentium: ["var(--font-gentium)", "serif"],
        noto: ["var(--font-noto-sans)", "sans-serif"],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [],
};
export default config;
