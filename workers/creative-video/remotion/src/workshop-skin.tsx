import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { skinEnter } from "./workshop-transition";

/**
 * The flash of a skin switch, over the whole frame (the captions too, for its few frames).
 * Frames are relative to the incoming scene's overlap of `frames` frames.
 */
export const SkinFlash: React.FC<{ frames: number; accent: string }> = ({
  frames,
  accent,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { flash } = skinEnter(frame, frames, fps);
  if (flash <= 0.005) return null;
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(circle at 50% 40%, #ffffff 0%, #ffffff 42%, color-mix(in srgb, ${accent} 40%, white) 100%)`,
        opacity: flash,
        pointerEvents: "none",
      }}
    />
  );
};

/** The light that sweeps across the incoming picture of a skin switch, right to left. */
export const SkinSweep: React.FC<{ at: number }> = ({ at }) => (
  <AbsoluteFill
    style={{
      background: `linear-gradient(110deg, transparent ${(at - 14).toFixed(1)}%, rgba(255,255,255,0.55) ${at.toFixed(1)}%, transparent ${(at + 14).toFixed(1)}%)`,
      mixBlendMode: "screen",
    }}
  />
);
