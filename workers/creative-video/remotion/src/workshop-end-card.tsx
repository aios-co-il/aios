import React from "react";
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
 * The closing card in the design Carmen chose (FilmLook.endCardStyle), each in its own file;
 * the classic card when none was chosen.
 */
export const EndCard: React.FC<
  EndCardProps & { design?: EndCardStyle | null }
> = ({ design, ...props }) => {
  const Design = DESIGNS[design ?? "classic"] ?? ClassicEndCard;
  return <Design {...props} />;
};
