import React from "react";
import {
  AbsoluteFill,
  Audio,
  Easing,
  Img,
  OffthreadVideo,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

export type WorkshopMove =
  "push" | "drift-left" | "drift-right" | "rise" | "pull";

export type WorkshopScene = {
  id: string;
  durationFrames: number;
  still?: string | null;
  clip?: string | null;
  caption?: string;
  move?: WorkshopMove;
};

export type WorkshopFilmProps = {
  scenes: WorkshopScene[];
  narration?: string | null;
  music?: string | null;
};

const clamp = {
  extrapolateLeft: "clamp",
  extrapolateRight: "clamp",
} as const;
const FADE = 8;

const camera = (move: WorkshopMove, progress: number) => {
  const drift = interpolate(progress, [0, 1], [-3.2, 3.2]);
  if (move === "drift-left") return { scale: 1.12, x: -drift, y: 0 };
  if (move === "drift-right") return { scale: 1.12, x: drift, y: 0 };
  if (move === "rise")
    return {
      scale: 1.14,
      x: 0,
      y: interpolate(progress, [0, 1], [3.2, -3.2]),
    };
  if (move === "pull")
    return {
      scale: interpolate(progress, [0, 1], [1.12, 1.02]),
      x: 0,
      y: 0,
    };
  return {
    scale: interpolate(progress, [0, 1], [1.02, 1.12]),
    x: 0,
    y: 0,
  };
};

const Picture: React.FC<{ scene: WorkshopScene }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const { durationInFrames, fps, height } = useVideoConfig();
  const progress = interpolate(
    frame,
    [0, Math.max(1, durationInFrames - 1)],
    [0, 1],
    { ...clamp, easing: Easing.inOut(Easing.cubic) },
  );
  const { scale, x, y } = camera(scene.move || "push", progress);
  const fadeIn = interpolate(frame, [0, FADE], [0, 1], clamp);
  const fadeOut = interpolate(
    frame,
    [durationInFrames - FADE, durationInFrames],
    [1, 0],
    clamp,
  );
  const sheen = interpolate(progress, [0, 1], [-40, 140]);
  const appear = spring({ frame, fps, config: { damping: 16, mass: 0.55 } });
  const caption = (scene.caption || "").trim();
  const fontSize = Math.round(height * 0.032);
  return (
    <AbsoluteFill
      style={{
        background: "#07111c",
        opacity: fadeIn * fadeOut,
        fontFamily: "Heebo, Arial, sans-serif",
      }}
    >
      <AbsoluteFill style={{ overflow: "hidden" }}>
        <AbsoluteFill
          style={{ transform: `scale(${scale}) translate(${x}%, ${y}%)` }}
        >
          {scene.clip ? (
            <OffthreadVideo
              src={staticFile(scene.clip)}
              muted
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : scene.still ? (
            <Img
              src={staticFile(scene.still)}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            <AbsoluteFill
              style={{
                background:
                  "radial-gradient(circle at 50% 30%, #164257, #07111c 70%)",
              }}
            />
          )}
        </AbsoluteFill>
        <AbsoluteFill
          style={{
            background: `linear-gradient(115deg, transparent ${sheen - 18}%, rgba(255,255,255,0.18) ${sheen}%, transparent ${sheen + 18}%)`,
            mixBlendMode: "soft-light",
          }}
        />
        <AbsoluteFill
          style={{
            background:
              "linear-gradient(180deg, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0) 28%, rgba(0,0,0,0.15) 58%, rgba(0,0,0,0.78) 100%)",
          }}
        />
      </AbsoluteFill>
      {caption ? (
        <div
          dir="rtl"
          style={{
            position: "absolute",
            right: "6%",
            bottom: "8%",
            width: "88%",
            transform: `translateY(${(1 - appear) * 28}px)`,
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
              background: "#08F467",
              transform: `scaleY(${appear})`,
              transformOrigin: "bottom",
            }}
          />
          <div
            style={{
              background: "rgba(6,16,28,0.78)",
              color: "white",
              fontWeight: 700,
              fontSize,
              lineHeight: 1.25,
              textAlign: "right",
              padding: "16px 22px 16px 18px",
            }}
          >
            {caption}
          </div>
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

export const WorkshopFilm: React.FC<WorkshopFilmProps> = ({
  scenes,
  narration,
  music,
}) => {
  const { durationInFrames } = useVideoConfig();
  let cursor = 0;
  return (
    <AbsoluteFill style={{ background: "#07111c" }}>
      <style>{`
        @font-face {
          font-family: "Heebo";
          src: url("${staticFile("fonts/Heebo-Bold.ttf")}") format("truetype");
          font-weight: 100 900;
          font-style: normal;
        }
      `}</style>
      {scenes.map((scene) => {
        const from = cursor;
        cursor += scene.durationFrames;
        return (
          <Sequence
            key={scene.id}
            from={from}
            durationInFrames={scene.durationFrames}
          >
            <Picture scene={scene} />
          </Sequence>
        );
      })}
      {narration ? <Audio src={staticFile(narration)} /> : null}
      {music ? (
        <Audio
          src={staticFile(music)}
          volume={(frame) =>
            interpolate(
              frame,
              [0, 18, Math.max(19, durationInFrames - 18), durationInFrames],
              [0, 0.16, 0.16, 0],
              clamp,
            )
          }
        />
      ) : null}
    </AbsoluteFill>
  );
};
