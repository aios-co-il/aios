/**
 * A scene's on-screen text as motion graphics, for a film without spoken captions: each word
 * springs in after the one before it, the text floats gently while it shows (a slow bob and
 * sway, as if in water), and numbers are drawn in the accent colour. On Staging (2 Nov) a film
 * without narration showed its text only as a plain caption line.
 */
import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { captionLayout, readableAccent, ramp } from "./workshop-layout";
import { TITLE_EXIT, motionTitleWords } from "./workshop-title-timing";

const clamp = {
  extrapolateLeft: "clamp",
  extrapolateRight: "clamp",
} as const;

/** One word: it rises, grows and sharpens into place from its entrance frame. */
const TitleWordView: React.FC<{
  text: string;
  at: number;
  colour: string;
  frame: number;
}> = ({ text, at, colour, frame }) => {
  const { fps } = useVideoConfig();
  const t = frame - at;
  const p = spring({
    frame: Math.max(0, t),
    fps,
    config: { damping: 13, mass: 0.5, stiffness: 160 },
  });
  const shown = t >= 0;
  const blur = (1 - ramp(t, 5)) * 10;
  return (
    <span
      style={{
        display: "inline-block",
        color: colour,
        opacity: shown ? ramp(t, 4) : 0,
        transform: `translateY(${((1 - p) * 0.6).toFixed(3)}em) scale(${(0.6 + 0.4 * p).toFixed(3)})`,
        filter: shown && blur > 0.2 ? `blur(${blur.toFixed(1)}px)` : undefined,
        textShadow:
          "0 0.04em 0 rgba(0,0,0,0.4), 0 0.06em 0.35em rgba(0,10,30,0.75)",
      }}
    >
      {text}
    </span>
  );
};

/** The text of one scene, in the frame where the captions would sit. */
export const MotionTitle: React.FC<{
  text: string;
  /** Frames of the scene's own entrance transition, before its first frame. */
  enter: number;
  accent: string;
}> = ({ text, enter, accent }) => {
  const frame = useCurrentFrame() - enter;
  const { width, height, durationInFrames } = useVideoConfig();
  const frames = durationInFrames - enter;
  const words = motionTitleWords(text, frames);
  if (words.length === 0 || frame < 0) {
    return null;
  }
  const layout = captionLayout(width, height);
  const leave = interpolate(
    frame,
    [frames - TITLE_EXIT, frames],
    [1, 0],
    clamp,
  );
  // The float: a slow bob and sway, out of step so it never looks mechanical.
  const bob = Math.sin(frame / 14) * layout.fontSize * 0.12;
  const sway = Math.sin(frame / 23 + 1.3) * 1.4;
  const key = readableAccent(accent);
  return (
    <AbsoluteFill
      style={{
        justifyContent: "flex-end",
        alignItems: "center",
        paddingBottom: layout.bottom,
      }}
    >
      <div
        dir="rtl"
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          columnGap: "0.28em",
          maxWidth: layout.safeWidth,
          fontWeight: 900,
          fontSize: layout.fontSize,
          lineHeight: 1.15,
          opacity: leave,
          transform: `translateY(${(bob - (1 - leave) * layout.fontSize * 0.5).toFixed(1)}px) rotate(${sway.toFixed(2)}deg)`,
        }}
      >
        {words.map((word, index) => (
          <TitleWordView
            key={`${index}-${word.text}`}
            text={word.text}
            at={word.at}
            colour={word.key ? key : "#ffffff"}
            frame={frame}
          />
        ))}
      </div>
    </AbsoluteFill>
  );
};
