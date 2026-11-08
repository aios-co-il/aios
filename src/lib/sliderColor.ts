import type { CSSProperties } from "react";

export type SliderColorStyle = CSSProperties & { "--slider-color": string };

/** Build CSS variables from the validated slider color. */
export function sliderColorStyle(color: string): SliderColorStyle {
  return { "--slider-color": color };
}

/** Read a supported stored slider color value. */
export function readSliderColor(
  style: CSSProperties | undefined,
): string | undefined {
  if (!style || !("--slider-color" in style)) return undefined;
  const value = style["--slider-color"];
  return typeof value === "string" ? value : undefined;
}
