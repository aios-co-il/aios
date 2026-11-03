/**
 * A scene's on-screen text as motion graphics, for a film without spoken captions: each word
 * enters after the one before it in the scene's style (workshop-title-styles.ts; the float
 * style also bobs and sways as if in water), and numbers are drawn in the accent colour. On
 * Staging (2 Nov) a film without narration showed its text only as a plain caption line. Once
 * in, the key words get the scene's emphasis (workshop-title-emphasis-view.tsx).
 */
import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { captionLayout, readableAccent } from "./workshop-layout";
import { TITLE_EXIT, motionTitleWords } from "./workshop-title-timing";
import type { TitleEmphasis } from "./workshop-title-emphasis";
import { EmphasizedWord } from "./workshop-title-emphasis-view";
import {
  SPRING_OF,
  floats,
  wordLook,
  SIZE_SCALE,
  type TitleSize,
  type TitleStyle,
} from "./workshop-title-styles";

const clamp = {
  extrapolateLeft: "clamp",
  extrapolateRight: "clamp",
} as const;

/** One word of the title, drawn in the scene's style (workshop-title-styles.ts). */
const TitleWordView: React.FC<{
  text: React.ReactNode;
  at: number;
  colour: string;
  frame: number;
  style: TitleStyle;
}> = ({ text, at, colour, frame, style }) => {
  const { fps } = useVideoConfig();
  const t = frame - at;
  const p = spring({ frame: Math.max(0, t), fps, config: SPRING_OF[style] });
  const look = wordLook(style, t, p);
  const word = (
    <span
      style={{
        display: "inline-block",
        color: colour,
        opacity: look.opacity,
        transform: `translate(${look.x.toFixed(3)}em, ${look.y.toFixed(3)}em) scale(${look.scale.toFixed(3)}) rotate(${look.rotate.toFixed(2)}deg)`,
        filter: look.blur > 0.2 ? `blur(${look.blur.toFixed(1)}px)` : undefined,
        // Typed from the reading side: Hebrew starts at the right.
        clipPath:
          look.shown < 1
            ? `inset(0 0 0 ${((1 - look.shown) * 100).toFixed(1)}%)`
            : undefined,
        textShadow:
          "0 0.04em 0 rgba(0,0,0,0.4), 0 0.06em 0.35em rgba(0,10,30,0.75)",
      }}
    >
      {text}
    </span>
  );
  // The reveal rises out of a mask that hides it below its line.
  return style === "reveal" ? (
    <span style={{ display: "inline-block", overflow: "hidden" }}>{word}</span>
  ) : (
    word
  );
};

/** The text of one scene, in the frame where the captions would sit. */
export const MotionTitle: React.FC<{
  text: string;
  /** Frames of the scene's own entrance transition, before its first frame. */
  enter: number;
  accent: string;
  style: TitleStyle;
  size: TitleSize;
  emphasis: TitleEmphasis;
}> = ({ text, enter, accent, style, size, emphasis }) => {
  const frame = useCurrentFrame() - enter;
  const { width, height, durationInFrames } = useVideoConfig();
  const frames = durationInFrames - enter;
  const words = motionTitleWords(text, frames);
  if (words.length === 0 || frame < 0) {
    return null;
  }
  const layout = captionLayout(width, height);
  const fontSize = Math.round(layout.fontSize * SIZE_SCALE[size]);
  const leave = interpolate(
    frame,
    [frames - TITLE_EXIT, frames],
    [1, 0],
    clamp,
  );
  // The float: a slow bob and sway, out of step so it never looks mechanical.
  const bob = floats(style) ? Math.sin(frame / 14) * fontSize * 0.12 : 0;
  const sway = floats(style) ? Math.sin(frame / 23 + 1.3) * 1.4 : 0;
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
          fontSize,
          lineHeight: 1.15,
          opacity: leave,
          transform: `translateY(${(bob - (1 - leave) * fontSize * 0.5).toFixed(1)}px) rotate(${sway.toFixed(2)}deg)`,
        }}
      >
        {words.map((word, index) => {
          const draw = (content: React.ReactNode, colour: string) => (
            <TitleWordView
              key={`${index}-${word.text}`}
              text={content}
              at={word.at}
              colour={colour}
              frame={frame}
              style={style}
            />
          );
          return word.key ? (
            <EmphasizedWord
              key={`${index}-${word.text}`}
              word={word}
              effect={emphasis}
              frame={frame}
              frames={frames}
              accent={key}
              draw={draw}
            />
          ) : (
            draw(word.text, "#ffffff")
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
