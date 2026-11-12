import type { ReactNode } from "react";
import type { MiniMePalette } from "./miniMePalette";
import { Beret, CodeGlasses, Headphones, Pencil } from "./miniMeHeadProps";
import { Clipboard, Coin, Magnifier, Target } from "./miniMeHandItems";
import {
  Clapper,
  FilmStrip,
  Gear,
  Megaphone,
  Palette,
} from "./miniMeHandTools";

/**
 * What each skin wears or holds, by skin-roles slug. Head props draw over
 * the face; hand props sit in the free (left) hand, in front of the body.
 * A skin without an entry is the plain classic.
 */
export const MINI_ME_PROPS: Record<
  string,
  {
    head?: (p: MiniMePalette) => ReactNode;
    hand?: (p: MiniMePalette) => ReactNode;
  }
> = {
  marketing_manager: { hand: () => <Megaphone /> },
  copywriter: { head: () => <Pencil /> },
  video_director: { head: () => <Beret />, hand: () => <Clapper /> },
  creative_direct: { hand: () => <Palette /> },
  video_editor: {
    head: (p) => <Headphones cup={p.mid} />,
    hand: () => <FilmStrip />,
  },
  web_builder: { head: () => <CodeGlasses /> },
  automator: { hand: (p) => <Gear hub={p.mid} /> },
  cfo: { hand: () => <Coin /> },
  campaigner: { hand: () => <Target /> },
  seo: { hand: (p) => <Magnifier handle={p.dark} /> },
  analyst: { hand: (p) => <Clipboard tab={p.dark} bar={p.mid} /> },
};
