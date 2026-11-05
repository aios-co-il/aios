/** One word of the motion captions (workshop-motion-captions.tsx): its entrance and highlight. */
import React from "react";
import { spring, useVideoConfig } from "remotion";
import type { WorkshopWord } from "./manifest";
import { KEY_SCALE, LEAD, WORD_PAD_EM, ramp } from "./workshop-layout";

/** The word itself; a Latin word or number is isolated so its punctuation stays with it. */
const WordText: React.FC<{ word: WorkshopWord }> = ({ word }) =>
  word.ltr ? <bdi dir="ltr">{word.text}</bdi> : <>{word.text}</>;

/** One word of a phrase: it springs in as it is said and sits on the highlight while spoken. */
export const MotionWord: React.FC<{
  word: WorkshopWord;
  /** When the highlight moves on: the next word's start, else shortly after this one. */
  activeUntil: number;
  now: number;
  accent: string;
  ink: string;
  keyColor: string;
}> = ({ word, activeUntil, now, accent, ink, keyColor }) => {
  const { fps } = useVideoConfig();
  const key = word.key === true;
  const size = `${key ? KEY_SCALE : 1}em`;
  const t = now - (word.startFrame - LEAD);
  if (t < 0)
    // Not said yet: the word keeps its place, so the phrase never shifts as words arrive.
    return (
      <span
        style={{
          display: "inline-block",
          fontSize: size,
          padding: `0 ${WORD_PAD_EM}em`,
          visibility: "hidden",
        }}
      >
        <WordText word={word} />
      </span>
    );
  // A plain word rises and sharpens into place; the key word slams down from larger.
  const p = spring({
    frame: t,
    fps,
    config: key
      ? { damping: 11, mass: 0.6, stiffness: 170 }
      : { damping: 14, mass: 0.45, stiffness: 190 },
  });
  const opacity = ramp(t, 3);
  const blur = (1 - ramp(t, key ? 5 : 4)) * (key ? 14 : 9);
  const scale = key ? 1.75 - 0.75 * p : 0.55 + 0.45 * p;
  const rise = key ? 0 : (1 - p) * 0.45;
  const turn = key ? (1 - p) * -6 : 0;
  // The highlight snaps on as the word is said and off when the next one starts: a fade
  // between two words reads as a smudge.
  const on = now >= word.startFrame && now < activeUntil;
  const pill = spring({
    frame: now - word.startFrame,
    fps,
    config: { damping: 12, mass: 0.35, stiffness: 240 },
  });
  const base = key ? keyColor : "#ffffff";
  return (
    <span
      style={{
        position: "relative",
        display: "inline-block",
        fontSize: size,
        padding: `0 ${WORD_PAD_EM}em`,
        opacity,
        transform: `translateY(${rise.toFixed(3)}em) scale(${scale.toFixed(3)}) rotate(${turn.toFixed(2)}deg)`,
        filter: blur > 0.2 ? `blur(${blur.toFixed(1)}px)` : undefined,
      }}
    >
      {on ? (
        <span
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: "0.12em",
            bottom: "0.04em",
            borderRadius: "0.18em",
            background: accent,
            transform: `scale(${(0.78 + 0.22 * pill).toFixed(3)})`,
            boxShadow: "0 0.08em 0.3em rgba(0,0,0,0.35)",
          }}
        />
      ) : null}
      <span
        style={{
          position: "relative",
          color: on ? ink : base,
          textShadow: on
            ? "none"
            : "0 0.03em 0 rgba(0,0,0,0.45), 0 0.05em 0.25em rgba(0,0,0,0.7)",
        }}
      >
        <WordText word={word} />
      </span>
    </span>
  );
};
