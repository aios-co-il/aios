import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { blobsAt, patternDrift, raysAt } from "./workshop-end-card-backdrop";
import { particlesAt } from "./workshop-end-card-particles";

/** The brand's two colours (brandPair): the accent and its second colour. */
export type Colours = { colours: [string, string] };

const alpha = (colour: string, percent: number) =>
  `color-mix(in srgb, ${colour} ${percent}%, transparent)`;

/** Darkens the edges so the card's text reads over any of the backgrounds. */
export const Vignette: React.FC = () => (
  <AbsoluteFill
    style={{
      background:
        "radial-gradient(ellipse at 50% 50%, rgba(4,6,12,0.05) 0%, rgba(4,6,12,0.4) 75%, rgba(4,6,12,0.7) 100%)",
    }}
  />
);

/** Soft blobs of the brand's colours drifting slowly on dark (blobsAt). */
export const GradientBackground: React.FC<Colours> = ({ colours }) => {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const size = Math.max(width, height);
  return (
    <AbsoluteFill style={{ background: "#04060c", overflow: "hidden" }}>
      {blobsAt(frame, fps).map((blob, index) => {
        const r = blob.r * size;
        return (
          <div
            key={index}
            style={{
              position: "absolute",
              left: blob.x * width - r,
              top: blob.y * height - r,
              width: 2 * r,
              height: 2 * r,
              background: `radial-gradient(circle, ${alpha(colours[blob.colour], 62)} 0%, ${alpha(colours[blob.colour], 18)} 40%, transparent 68%)`,
              mixBlendMode: "screen",
            }}
          />
        );
      })}
      <Vignette />
    </AbsoluteFill>
  );
};

/** Faint diagonal stripes and dots of the brand's colours, drifting slowly (patternDrift). */
export const PatternBackground: React.FC<Colours> = ({ colours }) => {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const tile = Math.round(Math.min(width, height) * 0.14);
  const drift = patternDrift(frame, tile, fps);
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(circle at 50% 45%, color-mix(in srgb, ${colours[0]} 22%, #05080f) 0%, #05080f 75%)`,
      }}
    >
      <svg width={width} height={height} style={{ position: "absolute" }}>
        <defs>
          <pattern
            id="end-card-pattern"
            width={tile}
            height={tile}
            patternUnits="userSpaceOnUse"
            patternTransform={`translate(${drift.x.toFixed(2)} ${drift.y.toFixed(2)})`}
          >
            <path
              d={`M0 ${tile} L${tile} 0 M${-tile / 2} ${tile / 2} L${tile / 2} ${-tile / 2} M${tile / 2} ${tile * 1.5} L${tile * 1.5} ${tile / 2}`}
              stroke={colours[0]}
              strokeOpacity={0.24}
              strokeWidth={Math.max(1, tile * 0.03)}
            />
            <circle
              cx={tile / 4}
              cy={tile / 4}
              r={tile * 0.05}
              fill={colours[1]}
              fillOpacity={0.45}
            />
          </pattern>
        </defs>
        <rect width={width} height={height} fill="url(#end-card-pattern)" />
      </svg>
      <Vignette />
    </AbsoluteFill>
  );
};

/** Soft lights of the brand's colours and white floating up, like bokeh (particlesAt). */
export const ParticlesBackground: React.FC<Colours> = ({ colours }) => {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const unit = Math.min(width, height);
  const tints = [...colours, "#ffffff"];
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(circle at 50% 40%, color-mix(in srgb, ${colours[0]} 26%, #05080f) 0%, #05080f 80%)`,
        overflow: "hidden",
      }}
    >
      {particlesAt(frame, 44, 7, fps).map((p, index) => {
        const r = p.r * unit;
        return (
          <div
            key={index}
            style={{
              position: "absolute",
              left: p.x * width - r,
              top: p.y * height - r,
              width: 2 * r,
              height: 2 * r,
              borderRadius: "50%",
              opacity: p.opacity,
              background: `radial-gradient(circle, ${tints[p.colour]} 0%, ${alpha(tints[p.colour], 45)} 45%, transparent 72%)`,
            }}
          />
        );
      })}
      <Vignette />
    </AbsoluteFill>
  );
};
