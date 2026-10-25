import React from "react";
import {
  AbsoluteFill,
  Audio,
  Easing,
  Freeze,
  Img,
  OffthreadVideo,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import {
  WORKSHOP_ACCENT,
  type WorkshopFilmProps,
  type WorkshopMove,
  type WorkshopScene,
} from "./manifest";
import { KaraokeCaptions } from "./workshop-captions";
import { EndCard } from "./workshop-end-card";
import { edgeFade, enterStyle } from "./workshop-transition";

export type {
  WorkshopFilmProps,
  WorkshopMove,
  WorkshopScene,
} from "./manifest";

const clamp = {
  extrapolateLeft: "clamp",
  extrapolateRight: "clamp",
} as const;

const camera = (move: WorkshopMove, progress: number) => {
  const drift = interpolate(progress, [0, 1], [-3.2, 3.2]);
  if (move === "static") return { scale: 1, x: 0, y: 0 };
  if (move === "drift-left") return { scale: 1.12, x: -drift, y: 0 };
  if (move === "drift-right") return { scale: 1.12, x: drift, y: 0 };
  if (move === "rise")
    return { scale: 1.14, x: 0, y: interpolate(progress, [0, 1], [3.2, -3.2]) };
  if (move === "pull")
    return { scale: interpolate(progress, [0, 1], [1.12, 1.02]), x: 0, y: 0 };
  return { scale: interpolate(progress, [0, 1], [1.02, 1.12]), x: 0, y: 0 };
};

const cover = { width: "100%", height: "100%", objectFit: "cover" } as const;

/** A clip shorter than its scene holds its last frame instead of going black. */
const Clip: React.FC<{ scene: WorkshopScene }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const volume = Math.max(0, Math.min(1, scene.clipVolume ?? 0));
  const video = (muted: boolean) => (
    <OffthreadVideo
      src={staticFile(scene.clip || "")}
      muted={muted || volume === 0}
      volume={volume}
      style={cover}
    />
  );
  const length = scene.clipFrames ?? 0;
  if (length > 0 && frame >= length)
    return <Freeze frame={Math.max(0, length - 1)}>{video(true)}</Freeze>;
  return video(false);
};

const Picture: React.FC<{
  scene: WorkshopScene;
  enter: number;
  accent: string;
  showCaption: boolean;
}> = ({ scene, enter, accent, showCaption }) => {
  const frame = useCurrentFrame();
  const { durationInFrames, fps, height } = useVideoConfig();
  const progress = interpolate(
    frame,
    [0, Math.max(1, durationInFrames - 1)],
    [0, 1],
    { ...clamp, easing: Easing.inOut(Easing.cubic) },
  );
  const { scale, x, y } = camera(scene.move || "push", progress);
  const sheen = interpolate(progress, [0, 1], [-40, 140]);
  const appear = spring({
    frame: frame - enter,
    fps,
    config: { damping: 16, mass: 0.55 },
  });
  const caption = showCaption ? (scene.caption || "").trim() : "";
  const fontSize = Math.round(height * 0.032);
  return (
    <AbsoluteFill
      style={{
        background: "#07111c",
        ...enterStyle(scene.transition || "crossfade", frame, enter),
      }}
    >
      <AbsoluteFill style={{ overflow: "hidden" }}>
        <AbsoluteFill
          style={{ transform: `scale(${scale}) translate(${x}%, ${y}%)` }}
        >
          {scene.clip ? (
            <Clip scene={scene} />
          ) : scene.still ? (
            <Img src={staticFile(scene.still)} style={cover} />
          ) : (
            <AbsoluteFill
              style={{
                background:
                  "radial-gradient(circle at 50% 30%, #164257, #07111c 70%)",
              }}
            />
          )}
        </AbsoluteFill>
        {scene.lipsync ? null : (
          <AbsoluteFill
            style={{
              background: `linear-gradient(115deg, transparent ${sheen - 18}%, rgba(255,255,255,0.18) ${sheen}%, transparent ${sheen + 18}%)`,
              mixBlendMode: "soft-light",
            }}
          />
        )}
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
              background: accent,
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
      {scene.voice ? (
        <Sequence from={enter} layout="none">
          <Audio src={staticFile(scene.voice)} />
        </Sequence>
      ) : null}
    </AbsoluteFill>
  );
};

const END_TRANSITION = 12;

export const WorkshopFilm: React.FC<WorkshopFilmProps> = ({
  scenes,
  narration,
  music,
  musicEnvelope,
  captions,
  brand,
  endCardFrames,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const accent = brand?.primaryColor || WORKSHOP_ACCENT;
  const fontFamily = brand?.fontFamily
    ? `"${brand.fontFamily}", Heebo, Arial, sans-serif`
    : "Heebo, Arial, sans-serif";
  const karaoke = (captions ?? []).filter((c) => c.words.length);
  const musicVolume = (f: number) => {
    const fade = Math.min(
      interpolate(f, [0, 18], [0, 1], clamp),
      interpolate(f, [durationInFrames - 45, durationInFrames], [1, 0], clamp),
    );
    const env = musicEnvelope;
    const level =
      env && env.frames.length > 1
        ? interpolate(f, env.frames, env.volumes, clamp)
        : 0.16;
    return level * fade;
  };
  let cursor = 0;
  const pictures = scenes.map((scene) => {
    const start = cursor;
    cursor += scene.durationFrames;
    const enter = Math.max(0, Math.min(start, scene.transitionFrames ?? 0));
    return (
      <Sequence
        key={scene.id}
        from={start - enter}
        durationInFrames={scene.durationFrames + enter}
      >
        <Picture
          scene={scene}
          enter={enter}
          accent={accent}
          showCaption={!karaoke.length}
        />
      </Sequence>
    );
  });
  const endFrames = endCardFrames && brand ? endCardFrames : 0;
  const endEnter = Math.min(END_TRANSITION, Math.floor(endFrames / 3));
  return (
    <AbsoluteFill style={{ background: "#07111c", fontFamily }}>
      <style>{`
        @font-face {
          font-family: "Heebo";
          src: url("${staticFile("fonts/Heebo-Bold.ttf")}") format("truetype");
          font-weight: 100 900;
          font-style: normal;
        }
      `}</style>
      {pictures}
      {karaoke.length ? (
        <KaraokeCaptions
          captions={karaoke}
          accent={accent}
          fontFamily={fontFamily}
        />
      ) : null}
      {endFrames && brand ? (
        <Sequence
          from={cursor - endEnter}
          durationInFrames={endFrames + endEnter}
        >
          <AbsoluteFill
            style={{
              opacity: interpolate(
                frame - cursor + endEnter,
                [0, endEnter],
                [0, 1],
                clamp,
              ),
            }}
          >
            <EndCard brand={brand} accent={accent} fontFamily={fontFamily} />
          </AbsoluteFill>
        </Sequence>
      ) : null}
      <AbsoluteFill
        style={{
          background: "black",
          opacity: 1 - edgeFade(frame, durationInFrames, 10),
          pointerEvents: "none",
        }}
      />
      {narration ? <Audio src={staticFile(narration)} /> : null}
      {music ? (
        <Audio src={staticFile(music)} loop volume={musicVolume} />
      ) : null}
    </AbsoluteFill>
  );
};
