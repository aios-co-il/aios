import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

const clamp = {
  extrapolateLeft: "clamp",
  extrapolateRight: "clamp",
} as const;

/**
 * The scene's own short title ("אנליסטית", "SEO ו-GEO") at the top of the frame while karaoke
 * captions run at the bottom: centred, right to left, over an accent bar, in after the
 * scene's transition and out before the next one.
 */
export const Kicker: React.FC<{
  text: string;
  enter: number;
  accent: string;
}> = ({ text, enter, accent }) => {
  const frame = useCurrentFrame();
  const { durationInFrames, fps, width, height } = useVideoConfig();
  const appear = spring({
    frame: frame - enter - 4,
    fps,
    config: { damping: 15, mass: 0.6 },
  });
  const leave = interpolate(
    frame,
    [durationInFrames - 14, durationInFrames - 4],
    [1, 0],
    clamp,
  );
  // One line on a phone frame too: the type shrinks for a long title (Heebo Bold ~0.6 em).
  const fontSize = Math.round(
    Math.min(
      Math.min(width, height) * 0.052,
      (width * 0.8) / (Math.max(1, [...text].length) * 0.6),
    ),
  );
  return (
    <AbsoluteFill
      style={{
        justifyContent: "flex-start",
        alignItems: "center",
        paddingTop: height > width ? "9%" : "6%",
      }}
    >
      <div
        dir="rtl"
        style={{
          maxWidth: "86%",
          display: "flex",
          flexDirection: "column",
          alignItems: "stretch",
          opacity: appear * leave,
          transform: `translateY(${(1 - appear) * -24}px)`,
        }}
      >
        <div
          style={{
            background: "rgba(6,16,28,0.58)",
            color: "white",
            fontWeight: 800,
            fontSize,
            lineHeight: 1.15,
            textAlign: "center",
            padding: `${Math.round(fontSize * 0.2)}px ${Math.round(fontSize * 0.45)}px`,
            textShadow: "0 2px 12px rgba(0,0,0,0.6)",
          }}
        >
          {text}
        </div>
        <div
          style={{
            height: Math.max(4, Math.round(fontSize * 0.1)),
            background: accent,
            transform: `scaleX(${appear})`,
          }}
        />
      </div>
    </AbsoluteFill>
  );
};
