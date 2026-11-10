/**
 * Chart colors for reports, read from the theme's CSS variables so charts
 * follow the tenant's brand and the light or dark mode.
 */
export const REPORT_CHART = {
  /** The main series: the brand accent. */
  primary: "hsl(var(--brand-accent))",
  /** A second series next to the main one: the brand's neutral silver. */
  secondary: "hsl(var(--brand-neutral))",
  grid: "hsl(var(--border))",
  axis: "hsl(var(--muted-foreground))",
} as const;

/** Axis tick style shared by report charts. */
export const REPORT_AXIS_TICK = { fill: REPORT_CHART.axis, fontSize: 12 };
