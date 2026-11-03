import type { EndCardBackground } from "./workshop-end-card-backdrop";
import type { EndCardStyle } from "./workshop-end-card-layout";
import type { FilmFont } from "./workshop-fonts";
import type { TitleEmphasis } from "./workshop-title-emphasis";
import type { SceneOverlay } from "./workshop-overlays";
import type { TitleSize, TitleStyle } from "./workshop-title-styles";
import type { WorkshopTransition } from "./workshop-transitions";

/** How a scene of the Workshop film is drawn (manifest.ts WorkshopScene): its picture and text. */
export type SceneLook = {
  /** "contain": a finished design, shown whole over a blurred copy of itself. Cover otherwise. */
  fit?: "contain" | "cover";
  /** How the scene's text enters in a film without narration; "float" when unset. */
  titleStyle?: TitleStyle;
  /** How large that text is; "medium" (the captions' size) when unset. */
  titleSize?: TitleSize;
  /** How its key words (numbers, prices, dates) are emphasised once in; "none" when unset. */
  titleEmphasis?: TitleEmphasis;
  /** The graphics over the picture, under the text (workshop-overlays.ts); none when unset. */
  overlay?: SceneOverlay;
  /** How the scene enters over the one before it (workshop-transitions.ts). */
  transition?: WorkshopTransition;
};

/** How the whole Workshop film's text and closing card look (manifest.ts WorkshopFilmProps). */
export type FilmLook = {
  /** The font Carmen chose (workshop-fonts.ts); the brand's font, else Heebo, when unset. */
  font?: FilmFont | null;
  /** The closing card's design (workshop-end-card.tsx); "classic" when unset. */
  endCardStyle?: EndCardStyle | null;
  /** What plays behind it (workshop-end-card-backdrop.ts); the film's last scene when unset. */
  endCardBackground?: EndCardBackground | null;
  /** Its logo and call to action sit on frosted glass (workshop-end-card-glass.ts). */
  endCardGlass?: boolean | null;
};
