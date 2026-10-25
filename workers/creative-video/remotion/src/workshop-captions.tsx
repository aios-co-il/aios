import React from "react";
import {
  AbsoluteFill,
  Sequence,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { WorkshopCaption } from "./manifest";

const clamp = {
  extrapolateLeft: "clamp",
  extrapolateRight: "clamp",
} as const;

/** One caption line. Frames are relative to the line's start; word frames are absolute. */
const Line: React.FC<{
  caption: WorkshopCaption;
  accent: string;
  fontFamily: string;
}> = ({ caption, accent, fontFamily }) => {
  const frame = useCurrentFrame();
  const { fps, height } = useVideoConfig();
  const now = caption.startFrame + frame;
  const length = caption.endFrame - caption.startFrame;
  const appear = spring({ frame, fps, config: { damping: 18, mass: 0.5 } });
  const leave = interpolate(frame, [length - 5, length], [1, 0], clamp);
  const fontSize = Math.round(height * 0.042);
  return (
    <AbsoluteFill
      style={{
        justifyContent: "flex-end",
        alignItems: "center",
        paddingBottom: "11%",
      }}
    >
      <div
        dir="rtl"
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: `0 ${Math.round(fontSize * 0.28)}px`,
          maxWidth: "86%",
          padding: `${Math.round(fontSize * 0.3)}px ${Math.round(fontSize * 0.55)}px`,
          borderRadius: Math.round(fontSize * 0.35),
          background: "rgba(6,12,22,0.62)",
          fontFamily,
          fontWeight: 800,
          fontSize,
          lineHeight: 1.3,
          opacity: appear * leave,
          transform: `translateY(${(1 - appear) * 24}px) scale(${0.96 + 0.04 * appear})`,
        }}
      >
        {caption.words.map((word, index) => {
          const active = now >= word.startFrame && now < word.endFrame;
          const spoken = now >= word.startFrame;
          const pop = spring({
            frame: now - word.startFrame,
            fps,
            config: { damping: 12, mass: 0.4 },
          });
          return (
            <span
              key={`${word.startFrame}-${index}`}
              style={{
                display: "inline-block",
                color: active ? accent : "white",
                opacity: spoken ? 1 : 0.55,
                transform: `scale(${active ? 1 + 0.08 * pop : 1})`,
                textShadow: "0 2px 10px rgba(0,0,0,0.55)",
              }}
            >
              {word.text}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

/** Karaoke-style Hebrew captions: the spoken word lights up in the brand colour. */
export const KaraokeCaptions: React.FC<{
  captions: WorkshopCaption[];
  accent: string;
  fontFamily: string;
}> = ({ captions, accent, fontFamily }) => (
  <>
    {captions.map((caption) => (
      <Sequence
        key={`caption-${caption.startFrame}`}
        from={caption.startFrame}
        durationInFrames={Math.max(1, caption.endFrame - caption.startFrame)}
        layout="none"
      >
        <Line caption={caption} accent={accent} fontFamily={fontFamily} />
      </Sequence>
    ))}
  </>
);
