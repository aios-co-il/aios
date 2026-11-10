import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";
import typography from "@tailwindcss/typography";
import { tailwindColors } from "./src/theme/tailwindColors";

export default {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        sans: ["Heebo", "sans-serif"],
        heebo: ["Heebo", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      colors: tailwindColors,
      borderRadius: {
        lg: "var(--radius)",
        md: "var(--radius-md)",
        sm: "var(--radius-sm)",
      },
      boxShadow: {
        "elevation-0": "none",
        "elevation-1": "var(--elevation-1)",
        "elevation-2": "var(--elevation-2)",
      },
      keyframes: {
        "accordion-down": {
          from: {
            height: "0",
          },
          to: {
            height: "var(--radix-accordion-content-height)",
          },
        },
        "accordion-up": {
          from: {
            height: "var(--radix-accordion-content-height)",
          },
          to: {
            height: "0",
          },
        },
        "carmen-glow": {
          "0%, 100%": {
            boxShadow:
              "0 0 8px 4px hsl(var(--primary) / 0.5), 0 0 16px 8px hsl(var(--primary) / 0.3), inset 0 0 4px 1px hsl(var(--primary) / 0.1)",
          },
          "50%": {
            boxShadow:
              "0 0 14px 7px hsl(var(--primary) / 0.7), 0 0 28px 14px hsl(var(--primary) / 0.4), inset 0 0 6px 2px hsl(var(--primary) / 0.15)",
          },
        },
        "carmen-breathe": {
          "0%, 100%": { transform: "translateY(0) scale(1)" },
          "50%": { transform: "translateY(-3px) scale(1.006)" },
        },
        "carmen-screen-flicker": {
          "0%, 100%": { opacity: "0.3" },
          "50%": { opacity: "0.55" },
        },
        "carmen-track": {
          "0%": { transform: "translateX(-60%) scaleX(0.5)" },
          "50%": { transform: "translateX(40%) scaleX(1)" },
          "100%": { transform: "translateX(160%) scaleX(0.5)" },
        },
        "carmen-typing-dot": {
          "0%, 70%, 100%": { opacity: "0.3", transform: "translateY(0)" },
          "35%": { opacity: "1", transform: "translateY(-2px)" },
        },
        "carmen-data-rise": {
          "0%": { opacity: "0", transform: "translateY(10px) scale(0.85)" },
          "25%": { opacity: "0.9" },
          "100%": { opacity: "0", transform: "translateY(-34px) scale(1.05)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "carmen-glow": "carmen-glow 2s ease-in-out infinite",
        "carmen-breathe": "carmen-breathe 6s ease-in-out infinite",
        "carmen-screen-flicker":
          "carmen-screen-flicker 3.2s ease-in-out infinite",
        "carmen-track": "carmen-track 2.4s ease-in-out infinite",
        "carmen-typing-dot": "carmen-typing-dot 1.3s ease-in-out infinite",
        "carmen-data-rise": "carmen-data-rise 3.2s ease-out infinite",
      },
    },
  },
  plugins: [animate, typography],
} satisfies Config;
