import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { type Colours, Vignette } from "./workshop-end-card-ambient";
import { raysAt } from "./workshop-end-card-backdrop";

/** Soft beams of the accent sweeping slowly from the top (raysAt). */
export const LightRaysBackground: React.FC<Colours> = ({ colours }) => {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const unit = Math.min(width, height);
  const beam = `color-mix(in srgb, ${colours[0]} 55%, white)`;
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(ellipse at 50% -10%, color-mix(in srgb, ${colours[0]} 38%, #05080f) 0%, #05080f 70%)`,
        overflow: "hidden",
      }}
    >
      {raysAt(frame, fps).map((ray, index) => (
        <div
          key={index}
          style={{
            position: "absolute",
            left: ray.x * width - (ray.width * width) / 2,
            top: -height * 0.08,
            width: ray.width * width,
            height: height * 1.3,
            transformOrigin: "50% 0",
            transform: `rotate(${ray.angle.toFixed(2)}deg)`,
            background: `linear-gradient(90deg, transparent 0%, ${beam} 50%, transparent 100%)`,
            maskImage: "linear-gradient(180deg, black 0%, transparent 80%)",
            WebkitMaskImage:
              "linear-gradient(180deg, black 0%, transparent 80%)",
            opacity: ray.opacity,
            filter: `blur(${Math.round(unit * 0.025)}px)`,
            mixBlendMode: "screen",
          }}
        />
      ))}
      <Vignette />
    </AbsoluteFill>
  );
};
