import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import {
  glassEntrance,
  glassStyle,
  glassWidth,
} from "./workshop-end-card-glass";

/**
 * The closing card's logo and call to action on a frosted-glass panel (FilmLook.endCardGlass),
 * entering gently; without glass its children are laid out as they would be without it. `width`
 * overrides the panel's share of the frame (the split card's halves).
 */
export const GlassPanel: React.FC<{
  glass: boolean;
  gap: number;
  width?: string;
  children: React.ReactNode;
}> = ({ glass, gap, width, children }) => {
  const frame = useCurrentFrame();
  const { width: frameWidth, height } = useVideoConfig();
  if (!glass) {
    return <>{children}</>;
  }
  const unit = Math.min(frameWidth, height);
  const enter = glassEntrance(frame);
  return (
    <div
      style={{
        ...glassStyle(unit),
        boxSizing: "border-box",
        width: width ?? `${Math.round(glassWidth(frameWidth, height) * 100)}%`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap,
        padding: `${Math.round(unit * 0.06)}px ${Math.round(unit * 0.04)}px`,
        opacity: enter.opacity,
        transform: `translateY(${(enter.lift * height).toFixed(1)}px) scale(${enter.scale.toFixed(4)})`,
      }}
    >
      {children}
    </div>
  );
};
