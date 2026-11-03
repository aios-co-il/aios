import type { FilmFont } from "./workshop-fonts";
import type { SceneOverlay } from "./workshop-overlays";
import type { TitleSize, TitleStyle } from "./workshop-title-styles";

/** How a scene of the Workshop film is drawn (manifest.ts WorkshopScene): its picture and text. */
export type SceneLook = {
  /** "contain": a finished design, shown whole over a blurred copy of itself. Cover otherwise. */
  fit?: "contain" | "cover";
  /** How the scene's text enters in a film without narration; "float" when unset. */
  titleStyle?: TitleStyle;
  /** How large that text is; "medium" (the captions' size) when unset. */
  titleSize?: TitleSize;
  /** The graphics over the picture, under the text (workshop-overlays.ts); none when unset. */
  overlay?: SceneOverlay;
};

/** How the whole Workshop film's text looks (manifest.ts WorkshopFilmProps). */
export type FilmLook = {
  /** The font Carmen chose (workshop-fonts.ts); the brand's font, else Heebo, when unset. */
  font?: FilmFont | null;
};
