import React from "react";
import {
  AbsoluteFill,
  Sequence,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { WorkshopCaption, WorkshopWord } from "./manifest";
import {
  LEAD,
  LINE_HEIGHT,
  WORD_GAP_EM,
  captionLayout,
  inkOn,
  lineEm,
  ramp,
  readableAccent,
  type CaptionLayout,
} from "./workshop-layout";
import { MotionWord } from "./workshop-motion-word";

const clamp = {
  extrapolateLeft: "clamp",
  extrapolateRight: "clamp",
} as const;

const easeOut = (p: number) => 1 - (1 - p) ** 3;

/** Frames a phrase takes to leave. */
const EXIT = 4;

type Item = { word: WorkshopWord; index: number };

/** A line's words in reading order: consecutive LTR words as one left-to-right run. */
function runsOf(items: Item[]) {
  const runs: { ltr: boolean; items: Item[] }[] = [];
  for (const item of items) {
    const ltr = item.word.ltr === true;
    const last = runs[runs.length - 1];
    if (last && last.ltr && ltr) last.items.push(item);
    else runs.push({ ltr, items: [item] });
  }
  return runs;
}

const row = {
  display: "flex",
  flexDirection: "row",
  alignItems: "baseline",
  justifyContent: "center",
  columnGap: `${WORD_GAP_EM}em`,
} as const;

/** One phrase: up to four words on one or two lines. Frames are relative to its Sequence. */
const Phrase: React.FC<{
  caption: WorkshopCaption;
  from: number;
  layout: CaptionLayout;
  accent: string;
  ink: string;
  keyColor: string;
}> = ({ caption, from, layout, accent, ink, keyColor }) => {
  const frame = useCurrentFrame();
  const now = from + frame;
  const length = caption.endFrame - from;
  const exit = easeOut(ramp(frame - (length - EXIT), EXIT));
  const items = caption.words.map((word, index) => ({ word, index }));
  const lines = [0, 1]
    .map((line) => items.filter((item) => (item.word.line ?? 0) === line))
    .filter((line) => line.length);
  // A long line shrinks to fit the safe width.
  const widest = Math.max(
    1,
    ...lines.map((line) => lineEm(line.map((item) => item.word))),
  );
  const fontSize = Math.max(
    16,
    Math.min(layout.fontSize, Math.floor(layout.safeWidth / widest)),
  );
  const activeUntil = (index: number) => {
    const next = caption.words[index + 1];
    return next
      ? next.startFrame
      : Math.min(caption.endFrame, caption.words[index].endFrame + 4);
  };
  const word = (item: Item) => (
    <MotionWord
      key={`${item.word.startFrame}-${item.index}`}
      word={item.word}
      activeUntil={activeUntil(item.index)}
      now={now}
      accent={accent}
      ink={ink}
      keyColor={keyColor}
    />
  );
  return (
    <AbsoluteFill
      style={{
        justifyContent: "flex-end",
        alignItems: "center",
        paddingBottom: layout.bottom,
      }}
    >
      <div
        style={{
          height: layout.box,
          width: "100%",
          display: "flex",
          flexDirection: "column",
          // From the top of the box, right under the scene's title card.
          justifyContent: "flex-start",
          alignItems: "center",
          fontSize,
          fontWeight: 800,
          lineHeight: LINE_HEIGHT,
          whiteSpace: "nowrap",
          opacity: 1 - exit,
          transform: `translateY(${(-exit * fontSize * 0.35).toFixed(1)}px) scale(${(1 - 0.05 * exit).toFixed(3)})`,
          filter: exit > 0.05 ? `blur(${(exit * 6).toFixed(1)}px)` : undefined,
        }}
      >
        {lines.map((line, index) => (
          <div key={index} dir="rtl" style={row}>
            {runsOf(line).map((run, r) =>
              run.ltr && run.items.length > 1 ? (
                <div key={`run-${r}`} dir="ltr" style={row}>
                  {run.items.map(word)}
                </div>
              ) : (
                run.items.map(word)
              ),
            )}
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};

/**
 * Motion-graphic captions: the narration in phrases of two to four words (render-worker
 * motion-captions.mjs), each word springing in as it is said, the spoken word on an accent
 * highlight and the phrase's key word larger in the accent colour. A soft shade behind the
 * phrases keeps them legible over a bright picture.
 */
export const MotionCaptions: React.FC<{
  captions: WorkshopCaption[];
  accent: string;
  fontFamily: string;
}> = ({ captions, accent, fontFamily }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const layout = captionLayout(width, height);
  const ink = inkOn(accent);
  const keyColor = readableAccent(accent);
  let shade = 0;
  for (const caption of captions) {
    const start = caption.startFrame - LEAD;
    if (start - 6 > frame || caption.endFrame + 8 < frame) continue;
    shade = Math.max(
      shade,
      interpolate(
        frame,
        [
          start - 6,
          start,
          Math.max(start + 1, caption.endFrame),
          caption.endFrame + 8,
        ],
        [0, 1, 1, 0],
        clamp,
      ),
    );
  }
  return (
    <AbsoluteFill style={{ fontFamily, pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          // Centred on the box's first line and a half, where most phrases sit.
          bottom: layout.bottom - Math.round(layout.box * 0.15),
          height: Math.round(layout.box * 1.6),
          background:
            "radial-gradient(ellipse 62% 50% at 50% 50%, rgba(2,6,14,0.62) 0%, rgba(2,6,14,0.38) 45%, rgba(2,6,14,0) 100%)",
          opacity: shade,
        }}
      />
      {captions.map((caption) => {
        const from = Math.max(0, caption.startFrame - LEAD);
        return (
          <Sequence
            key={`motion-${caption.startFrame}`}
            from={from}
            durationInFrames={Math.max(1, caption.endFrame - from)}
            layout="none"
          >
            <Phrase
              caption={caption}
              from={from}
              layout={layout}
              accent={accent}
              ink={ink}
              keyColor={keyColor}
            />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
