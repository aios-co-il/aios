import { ACCENT_STEPS } from "./tokens";

/** The tenant accent as a 50–950 scale (generated in tokens.ts). */
const accentScale = Object.fromEntries(
  ACCENT_STEPS.map((step) => [
    step,
    `hsl(var(--brand-accent-${step}) / <alpha-value>)`,
  ]),
);

/** Tailwind color names → theme CSS variables. Components use only these. */
export const tailwindColors = {
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
  success: {
    DEFAULT: "hsl(var(--success))",
    foreground: "hsl(var(--success-foreground))",
  },
  popover: {
    DEFAULT: "hsl(var(--popover))",
    foreground: "hsl(var(--popover-foreground))",
  },
  card: {
    DEFAULT: "hsl(var(--card))",
    foreground: "hsl(var(--card-foreground))",
  },
  surface: {
    elevated: "hsl(var(--surface-elevated))",
    inset: "hsl(var(--surface-inset))",
    "status-yellow": "hsl(var(--surface-status-yellow))",
    "status-red": "hsl(var(--surface-status-red))",
    "status-green": "hsl(var(--surface-status-green))",
  },
  // Legacy palette names that used to mean "brand green" now follow the
  // tenant accent. Screens move to semantic tokens as they are
  // redesigned (AIO-530).
  emerald: accentScale,
  teal: accentScale,
  brand: {
    accent: {
      ...accentScale,
      DEFAULT: "hsl(var(--brand-accent) / <alpha-value>)",
      soft: "hsl(var(--brand-accent-soft) / <alpha-value>)",
    },
    ink: "hsl(var(--brand-ink) / <alpha-value>)",
    mint: "hsl(var(--brand-mint) / <alpha-value>)",
    neutral: "hsl(var(--brand-neutral) / <alpha-value>)",
    highlight: "hsl(var(--brand-highlight) / <alpha-value>)",
  },
  status: {
    foreground: "hsl(var(--status-foreground))",
    draft: "hsl(var(--status-draft))",
    "draft-surface": "hsl(var(--status-draft-surface))",
    active: "hsl(var(--status-active))",
    "active-surface": "hsl(var(--status-active-surface))",
    progress: "hsl(var(--status-progress))",
    "progress-surface": "hsl(var(--status-progress-surface))",
  },
  sidebar: {
    DEFAULT: "hsl(var(--sidebar-background))",
    foreground: "hsl(var(--sidebar-foreground))",
    primary: "hsl(var(--sidebar-primary))",
    "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
    accent: "hsl(var(--sidebar-accent))",
    "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
    border: "hsl(var(--sidebar-border))",
    ring: "hsl(var(--sidebar-ring))",
  },
};
