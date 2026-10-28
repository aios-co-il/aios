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
import { accentColours, captionLayout } from "./workshop-layout";

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
  // The spoken word over the dark box: a dark brand colour is lightened to stay legible.
  const said = accentColours(accent).text;
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
                color: active ? said : "white",
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

/**
 * A scene's own on-screen text as a boxed line with an accent bar on its right, in after the
 * scene's transition. Without word timings it sits at the bottom, where captions would; over
 * spoken captions (`at` "top") it sits at the top of the frame, clear of a phone's top band.
 */
export const SceneCaption: React.FC<{
  text: string;
  enter: number;
  accent: string;
  at: "top" | "bottom";
}> = ({ text, enter, accent, at }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const layout = captionLayout(width, height);
  const appear = spring({
    frame: frame - enter,
    fps,
    config: { damping: 16, mass: 0.55 },
  });
  // In from the nearest edge of the frame.
  const away = at === "top" ? -28 : 28;
  return (
    <div
      dir="rtl"
      style={{
        position: "absolute",
        right: "6%",
        ...(at === "top" ? { top: layout.top } : { bottom: layout.bottom }),
        width: "88%",
        transform: `translateY(${(1 - appear) * away}px)`,
        opacity: appear,
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          right: 0,
          width: 5,
          background: accent,
          transform: `scaleY(${appear})`,
          transformOrigin: at === "top" ? "top" : "bottom",
        }}
      />
      <div
        style={{
          background: "rgba(6,16,28,0.78)",
          color: "white",
          fontWeight: 700,
          fontSize: layout.sceneFontSize,
          lineHeight: 1.25,
          textAlign: "right",
          padding: "16px 22px 16px 18px",
        }}
      >
        {text}
      </div>
    </div>
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
