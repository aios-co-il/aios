import React from "react";
import type { WorkshopScene } from "./manifest";
import {
  endCardBackgroundOf,
  type EndCardBackground as Background,
} from "./workshop-end-card-backdrop";
import { EndCardBackground } from "./workshop-end-card-background";
import { BoldEndCard } from "./workshop-end-card-bold";
import { ClassicEndCard } from "./workshop-end-card-classic";
import type { EndCardProps, EndCardStyle } from "./workshop-end-card-layout";
import { MinimalEndCard } from "./workshop-end-card-minimal";
import { SplitEndCard } from "./workshop-end-card-split";

const DESIGNS: Record<EndCardStyle, React.FC<EndCardProps>> = {
  classic: ClassicEndCard,
  bold: BoldEndCard,
  minimal: MinimalEndCard,
  split: SplitEndCard,
};

/**
 * The closing card in the design Carmen chose (FilmLook.endCardStyle), each in its own file,
 * over the background she chose (the film's last scene when none; "plain" leaves the design its
 * own ground), its logo and call to action on glass when she asked for it.
 */
export const EndCard: React.FC<
  Omit<EndCardProps, "ground" | "glass"> & {
    design?: EndCardStyle | null;
    background?: Background | null;
    glass?: boolean | null;
    /** The film's last scene and how many of its frames had played when the card began. */
    lastScene?: WorkshopScene | null;
    lastSceneFrom: number;
  }
> = ({ design, background, glass, lastScene, lastSceneFrom, ...props }) => {
  const Design = DESIGNS[design ?? "classic"] ?? ClassicEndCard;
  const kind = endCardBackgroundOf(background);
  return (
    <>
      {kind === "plain" ? null : (
        <EndCardBackground
          kind={kind}
          accent={props.accent}
          secondary={props.brand.secondaryColor}
          scene={lastScene}
          sceneFrom={lastSceneFrom}
        />
      )}
      <Design {...props} ground={kind === "plain"} glass={glass === true} />
    </>
  );
};
