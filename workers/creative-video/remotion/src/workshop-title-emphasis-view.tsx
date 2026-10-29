/**
 * Draws the emphasis of one key word of a scene's motion title (workshop-motion-title.tsx), from
 * the per-frame numbers of workshop-title-emphasis.ts. The decorations sit outside the word's own
 * entrance (its typewriter clip or reveal mask), so they are never cut off with it.
 */
import React from "react";
import type { TitleWord } from "./workshop-title-timing";
import {
  type EmphasisLook,
  type TitleEmphasis,
  countText,
  countable,
  emphasisLook,
  emphasisStart,
} from "./workshop-title-emphasis";

/** A key word with its emphasis; `draw` draws the word itself with its entrance. */
export const EmphasizedWord: React.FC<{
  word: TitleWord;
  effect: TitleEmphasis;
  /** The title's frame and length, as in workshop-motion-title.tsx. */
  frame: number;
  frames: number;
  accent: string;
  draw: (content: React.ReactNode, colour: string) => React.ReactNode;
}> = ({ word, effect, frame, frames, accent, draw }) => {
  if (effect === "none") {
    return <>{draw(word.text, accent)}</>;
  }
  const look = emphasisLook(effect, frame - emphasisStart(word.at, frames));
  const number = effect === "count" ? countable(word.text) : null;
  const content = number ? (
    // The final number holds the width, so the line does not reflow as the digits grow.
    <span
      style={{
        display: "inline-grid",
        justifyItems: "center",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      <span style={{ gridArea: "1 / 1", visibility: "hidden" }}>
        {word.text}
      </span>
      <span style={{ gridArea: "1 / 1" }}>{countText(number, look.count)}</span>
    </span>
  ) : (
    word.text
  );
  // Over the highlighter's bar the word reads in white, not in the bar's own colour.
  const colour = effect === "marker" ? "#ffffff" : accent;
  // The circle and the stamp's box reach past the word: room so they do not touch its neighbours.
  const room = effect === "circle" || effect === "stamp" ? "0 0.2em" : 0;
  return (
    <span
      style={{
        position: "relative",
        display: "inline-block",
        margin: room,
        transform: `translate(${look.x.toFixed(3)}em, ${look.y.toFixed(3)}em) scale(${look.scale.toFixed(3)}) rotate(${look.rotate.toFixed(2)}deg)`,
      }}
    >
      {look.marker > 0 ? <MarkerBar look={look} accent={accent} /> : null}
      <span style={{ position: "relative", display: "inline-block" }}>
        {draw(content, colour)}
      </span>
      {effect === "underline" && look.line > 0 ? (
        <Underline look={look} accent={accent} />
      ) : null}
      {effect === "circle" && look.line > 0 ? (
        <Circle look={look} accent={accent} />
      ) : null}
      {look.box > 0 ? <StampBox look={look} accent={accent} /> : null}
    </span>
  );
};

type Mark = React.FC<{ look: EmphasisLook; accent: string }>;

/** A highlighter bar over the word's lower part, swept in from the side Hebrew reads from. */
const MarkerBar: Mark = ({ look, accent }) => (
  <span
    style={{
      position: "absolute",
      left: "-0.12em",
      right: "-0.12em",
      top: "38%",
      bottom: "4%",
      background: accent,
      opacity: 0.6,
      borderRadius: "0.1em",
      transformOrigin: "right center",
      transform: `scaleX(${look.marker.toFixed(3)}) skewX(-10deg)`,
    }}
  />
);

/** An accent line drawn under the word, from right to left. */
const Underline: Mark = ({ look, accent }) => (
  <span
    style={{
      position: "absolute",
      left: "-0.04em",
      right: "-0.04em",
      bottom: "-0.02em",
      height: "0.09em",
      background: accent,
      borderRadius: "0.05em",
      boxShadow: "0 0.03em 0.12em rgba(0,10,30,0.6)",
      transformOrigin: "right center",
      transform: `scaleX(${look.line.toFixed(3)}) rotate(-1deg)`,
    }}
  />
);

// A loose ellipse around the word that overshoots its start, as a pen would.
const LOOP =
  "M 80 9 C 44 -1, 5 10, 3 48 C 1 84, 38 98, 62 95 C 90 92, 99 70, 97 45 C 95 18, 72 4, 38 12";

/** A hand-drawn ellipse around the word, its stroke drawn in (stroke-dashoffset). */
const Circle: Mark = ({ look, accent }) => (
  <svg
    viewBox="0 0 100 100"
    preserveAspectRatio="none"
    style={{
      position: "absolute",
      left: "-0.34em",
      top: "-0.3em",
      width: "calc(100% + 0.68em)",
      height: "calc(100% + 0.52em)",
      overflow: "visible",
      filter: "drop-shadow(0 0.03em 0.08em rgba(0,10,30,0.6))",
    }}
  >
    <path
      d={LOOP}
      pathLength={1}
      fill="none"
      stroke={accent}
      strokeWidth="0.08em"
      strokeLinecap="round"
      vectorEffect="non-scaling-stroke"
      strokeDasharray="1"
      strokeDashoffset={(1 - look.line).toFixed(4)}
    />
  </svg>
);

/** The rubber stamp's outline box, around the word once it has hit. */
const StampBox: Mark = ({ look, accent }) => (
  <span
    style={{
      position: "absolute",
      inset: "0.02em -0.2em -0.02em -0.2em",
      border: `0.07em solid ${accent}`,
      borderRadius: "0.12em",
      opacity: look.box,
      boxShadow: "0 0.03em 0.12em rgba(0,10,30,0.5)",
    }}
  />
);
