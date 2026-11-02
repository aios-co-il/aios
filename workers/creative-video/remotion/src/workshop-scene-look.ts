import type { TitleSize, TitleStyle } from "./workshop-title-styles";

/** How a scene of the Workshop film is drawn (manifest.ts WorkshopScene): its picture and text. */
export type SceneLook = {
  /** "contain": a finished design, shown whole over a blurred copy of itself. Cover otherwise. */
  fit?: "contain" | "cover";
  /** How the scene's text enters in a film without narration; "float" when unset. */
  titleStyle?: TitleStyle;
  /** How large that text is; "medium" (the captions' size) when unset. */
  titleSize?: TitleSize;
};
