/** The workshop film's closing card, faded in over the last scene, which plays on behind it. */
import React from "react";
import { AbsoluteFill, Sequence, interpolate, useCurrentFrame } from "remotion";
import {
  type WorkshopBrand,
  type WorkshopFilmProps,
  type WorkshopScene,
} from "./manifest";
import { EndCard } from "./workshop-end-card";

const clamp = {
  extrapolateLeft: "clamp",
  extrapolateRight: "clamp",
} as const;

export const FilmEndCard: React.FC<
  Pick<
    WorkshopFilmProps,
    "endCardStyle" | "endCardBackground" | "endCardGlass"
  > & {
    brand: WorkshopBrand;
    accent: string;
    fontFamily: string;
    lastScene: WorkshopScene | undefined;
    lastSceneFrom: number;
    /** The frame the scenes end at, the card's length and its fade-in. */
    cursor: number;
    endFrames: number;
    endEnter: number;
  }
> = ({
  brand,
  endCardStyle,
  endCardBackground,
  endCardGlass,
  accent,
  fontFamily,
  lastScene,
  lastSceneFrom,
  cursor,
  endFrames,
  endEnter,
}) => {
  const frame = useCurrentFrame();
  return (
    <Sequence from={cursor - endEnter} durationInFrames={endFrames + endEnter}>
      <AbsoluteFill
        style={{
          opacity: interpolate(
            frame - cursor + endEnter,
            [0, endEnter],
            [0, 1],
            clamp,
          ),
        }}
      >
        <EndCard
          brand={brand}
          accent={accent}
          fontFamily={fontFamily}
          design={endCardStyle}
          background={endCardBackground}
          glass={endCardGlass}
          lastScene={lastScene}
          lastSceneFrom={lastSceneFrom}
        />
      </AbsoluteFill>
    </Sequence>
  );
};
