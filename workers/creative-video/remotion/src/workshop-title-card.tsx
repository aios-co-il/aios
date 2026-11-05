import React from "react";
import {
  AbsoluteFill,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { captionLayout } from "./workshop-layout";
import { titleCardWipe } from "./workshop-title-card-wipe";

const ramp = (x: number, frames: number) =>
  Math.min(1, Math.max(0, x / frames));
const easeInOut = (p: number) =>
  p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2;
const pct = (share: number) => `${(share * 100).toFixed(2)}%`;
const easeOut = (p: number) => 1 - (1 - p) ** 3;

/**
 * The scene's title over motion captions, as a title card on the scene's first frames: a short
 * accent wiper crosses it from the right and uncovers the title behind it
 * (workshop-title-card-wipe.ts), which settles from slightly larger, gets its underline and a
 * pass of light, and stays right above the captions until it drops away before the next scene.
 */
export const TitleCard: React.FC<{
  text: string;
  enter: number;
  accent: string;
}> = ({ text, enter, accent }) => {
  const frame = useCurrentFrame();
  const { durationInFrames, fps, width, height } = useVideoConfig();
  const layout = captionLayout(width, height);
  const t = frame - enter - 2;
  if (t < 0) return null;
  const fontSize = Math.round(
    Math.min(
      layout.titleFontSize,
      (width * 0.8) / (Math.max(1, [...text].length) * 0.6 + 1),
    ),
  );
  const wipe = titleCardWipe(t);
  const settle = spring({
    frame: t,
    fps,
    config: { damping: 15, mass: 0.6 },
  });
  const underline = easeOut(ramp(t - 12, 10));
  const sheen = ramp(t - 20, 18);
  const sweep = (1 - sheen) * 160 - 30;
  const leave = easeInOut(ramp(frame - (durationInFrames - 14), 10));
  const line = Math.max(4, Math.round(fontSize * 0.09));
  return (
    <AbsoluteFill
      style={{
        justifyContent: "flex-end",
        alignItems: "center",
        paddingBottom: layout.titleBottom,
      }}
    >
      <div
        dir="rtl"
        style={{
          position: "relative",
          maxWidth: "86%",
          opacity: 1 - leave,
          transform: `translateY(${(leave * fontSize * 0.45).toFixed(1)}px)`,
        }}
      >
        <div
          style={{
            position: "relative",
            overflow: "hidden",
            padding: `${Math.round(fontSize * 0.12)}px ${Math.round(fontSize * 0.5)}px`,
            // Uncovered from the right, behind the retreating bar (Hebrew reads right to left).
            clipPath: `inset(0 0 0 ${pct(1 - wipe.shown)})`,
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(5,12,22,0.66)",
            }}
          />
          <div
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              right: 0,
              width: Math.max(5, Math.round(fontSize * 0.12)),
              background: accent,
            }}
          />
          <div
            style={{
              position: "relative",
              color: "white",
              fontWeight: 800,
              fontSize,
              lineHeight: 1.15,
              whiteSpace: "nowrap",
              textAlign: "center",
              transform: `scale(${(1.12 - 0.12 * settle).toFixed(3)})`,
              textShadow: "0 2px 12px rgba(0,0,0,0.5)",
            }}
          >
            {text}
          </div>
          {sheen > 0 && sheen < 1 ? (
            // A pass of light from right to left.
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: `linear-gradient(105deg, transparent ${(sweep - 20).toFixed(1)}%, rgba(255,255,255,0.32) ${sweep.toFixed(1)}%, transparent ${(sweep + 20).toFixed(1)}%)`,
                mixBlendMode: "screen",
              }}
            />
          ) : null}
        </div>
        <div
          style={{
            height: line,
            background: accent,
            transform: `scaleX(${underline.toFixed(3)})`,
            transformOrigin: "right",
          }}
        />
        {wipe.barTo > wipe.barFrom ? (
          <div
            style={{
              position: "absolute",
              top: 0,
              bottom: line,
              right: pct(wipe.barFrom),
              width: pct(wipe.barTo - wipe.barFrom),
              background: accent,
            }}
          />
        ) : null}
      </div>
    </AbsoluteFill>
  );
};
