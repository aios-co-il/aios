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
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import {
  WORKSHOP_ACCENT,
  type WorkshopFilmProps,
  type WorkshopMove,
  type WorkshopMusicLoop,
  type WorkshopScene,
} from "./manifest";
import { KaraokeCaptions, SceneCaption } from "./workshop-captions";
import { EndCard } from "./workshop-end-card";
import { Kicker } from "./workshop-kicker";
import { MotionCaptions } from "./workshop-motion-captions";
import { SkinFlash, SkinSweep } from "./workshop-skin";
import { TitleCard } from "./workshop-title-card";
import {
  edgeFade,
  enterStyle,
  skinEnter,
  skinExit,
} from "./workshop-transition";

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

/** Frames the move fades in over the talking clip's last frame (lip sync to the skin's move). */
const MOVE_FADE = 5;

/** After a line lip-synced on the still, the scene's animated clip: the skin's own move. */
const MoveClip: React.FC<{ scene: WorkshopScene }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const video = (
    <OffthreadVideo
      src={staticFile(scene.moveClip || "")}
      muted
      style={cover}
    />
  );
  const length = scene.moveFrames ?? 0;
  return (
    <AbsoluteFill
      style={{ opacity: interpolate(frame, [0, MOVE_FADE], [0, 1], clamp) }}
    >
      {length > 0 && frame >= length ? (
        <Freeze frame={Math.max(0, length - 1)}>{video}</Freeze>
      ) : (
        video
      )}
    </AbsoluteFill>
  );
};

type TitleMode = "none" | "kicker" | "card";

const Picture: React.FC<{
  scene: WorkshopScene;
  enter: number;
  /** Frames of the next scene's skin switch over this scene's end (0 for another cut). */
  exitFrames: number;
  accent: string;
  showCaption: boolean;
  title: TitleMode;
}> = ({ scene, enter, exitFrames, accent, showCaption, title }) => {
  const frame = useCurrentFrame();
  const { durationInFrames, fps } = useVideoConfig();
  const progress = interpolate(
    frame,
    [0, Math.max(1, durationInFrames - 1)],
    [0, 1],
    { ...clamp, easing: Easing.inOut(Easing.cubic) },
  );
  const { scale, x, y } = camera(scene.move || "push", progress);
  const sheen = interpolate(progress, [0, 1], [-40, 140]);
  const caption = showCaption ? (scene.caption || "").trim() : "";
  const kicker = title !== "none" ? (scene.kicker || "").trim() : "";
  const skin =
    scene.transition === "skin" && enter > 0
      ? skinEnter(frame, enter, fps)
      : null;
  const out = skinExit(frame, durationInFrames, exitFrames);
  const punch = (skin?.scale ?? 1) * out.scale;
  const blur = Math.max(skin?.blur ?? 0, out.blur);
  const filters = [
    out.brightness !== 1 ? `brightness(${out.brightness.toFixed(3)})` : "",
    blur > 0.2 ? `blur(${blur.toFixed(1)}px)` : "",
  ].filter(Boolean);
  return (
    <AbsoluteFill>
      <AbsoluteFill
        style={{
          background: "#07111c",
          ...(skin
            ? { opacity: skin.shown ? 1 : 0 }
            : enterStyle(scene.transition || "crossfade", frame, enter)),
        }}
      >
        <AbsoluteFill
          style={{
            overflow: "hidden",
            ...(punch !== 1 ? { transform: `scale(${punch.toFixed(4)})` } : {}),
            ...(filters.length ? { filter: filters.join(" ") } : {}),
          }}
        >
          <AbsoluteFill
            style={{ transform: `scale(${scale}) translate(${x}%, ${y}%)` }}
          >
            {scene.clip ? (
              <>
                <Clip scene={scene} />
                {scene.moveClip ? (
                  <Sequence from={Math.max(0, scene.moveFrom ?? 0)}>
                    <MoveClip scene={scene} />
                  </Sequence>
                ) : null}
              </>
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
          {skin?.sweep != null ? <SkinSweep at={skin.sweep} /> : null}
        </AbsoluteFill>
        {caption ? (
          <SceneCaption text={caption} enter={enter} accent={accent} />
        ) : null}
        {kicker && title === "kicker" ? (
          <Kicker text={kicker} enter={enter} accent={accent} />
        ) : null}
        {kicker && title === "card" ? (
          <TitleCard text={kicker} enter={enter} accent={accent} />
        ) : null}
      </AbsoluteFill>
      {scene.voice ? (
        <Sequence from={enter} layout="none">
          <Audio src={staticFile(scene.voice)} />
        </Sequence>
      ) : null}
    </AbsoluteFill>
  );
};

const END_TRANSITION = 12;

/** One music copy's own fade (equal power) at frame f of the copy. */
const loopGain = (loop: WorkshopMusicLoop, f: number) => {
  const part = (value: number) => Math.min(1, Math.max(0, value));
  const fadeIn =
    loop.fadeInFrames > 0
      ? Math.sin((Math.PI / 2) * part(f / loop.fadeInFrames))
      : 1;
  const fadeOut =
    loop.fadeOutFrames > 0
      ? Math.cos(
          (Math.PI / 2) *
            part(
              (f - (loop.frameCount - loop.fadeOutFrames)) / loop.fadeOutFrames,
            ),
        )
      : 1;
  return fadeIn * fadeOut;
};

export const WorkshopFilm: React.FC<WorkshopFilmProps> = ({
  scenes,
  narration,
  music,
  musicLoops,
  musicEnvelope,
  effects,
  effectsEnvelope,
  captions,
  captionStyle,
  brand,
  endCardFrames,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const accent = brand?.primaryColor || WORKSHOP_ACCENT;
  const fontFamily = brand?.fontFamily
    ? `"${brand.fontFamily}", Heebo, Arial, sans-serif`
    : "Heebo, Arial, sans-serif";
  const spoken = (captions ?? []).filter((c) => c.words.length);
  // Motion graphics when the manifest asks for them; karaoke lines for older films.
  const motion = captionStyle === "motion";
  const title: TitleMode = !spoken.length ? "none" : motion ? "card" : "kicker";
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
  /** An effect's level at film frame f: under the voice it dips like the music bed. */
  const effectVolume = (f: number) => {
    const env = effectsEnvelope;
    return env && env.frames.length > 1
      ? interpolate(f, env.frames, env.volumes, clamp)
      : 0.5;
  };
  const starts: number[] = [];
  let cursor = 0;
  for (const scene of scenes) {
    starts.push(cursor);
    cursor += scene.durationFrames;
  }
  const enterOf = (index: number) =>
    Math.max(0, Math.min(starts[index], scenes[index].transitionFrames ?? 0));
  const pictures = scenes.map((scene, index) => {
    const start = starts[index];
    const enter = enterOf(index);
    const next = scenes[index + 1];
    return (
      <Sequence
        key={scene.id}
        from={start - enter}
        durationInFrames={scene.durationFrames + enter}
      >
        <Picture
          scene={scene}
          enter={enter}
          exitFrames={next?.transition === "skin" ? enterOf(index + 1) : 0}
          accent={accent}
          showCaption={!spoken.length}
          title={title}
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
      {spoken.length && motion ? (
        <MotionCaptions
          captions={spoken}
          accent={accent}
          fontFamily={fontFamily}
        />
      ) : spoken.length ? (
        <KaraokeCaptions
          captions={spoken}
          accent={accent}
          fontFamily={fontFamily}
        />
      ) : null}
      {scenes.map((scene, index) => {
        const enter = enterOf(index);
        if (scene.transition !== "skin" || enter <= 0) return null;
        return (
          <Sequence
            key={`flash-${scene.id}`}
            from={starts[index] - enter}
            durationInFrames={enter + 8}
            layout="none"
          >
            <SkinFlash frames={enter} accent={accent} />
          </Sequence>
        );
      })}
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
      {music && musicLoops?.length ? (
        // Copies of the track cover the film (a render cannot rely on `loop`, which needs the
        // browser to have read the track's length first).
        musicLoops.map((loop, index) => (
          <Sequence
            key={`music-${index}`}
            from={loop.startFrame}
            durationInFrames={loop.frameCount}
            layout="none"
          >
            <Audio
              src={staticFile(music)}
              volume={(f) =>
                musicVolume(loop.startFrame + f) * loopGain(loop, f)
              }
            />
          </Sequence>
        ))
      ) : music ? (
        <Audio src={staticFile(music)} loop volume={musicVolume} />
      ) : null}
      {(effects ?? []).map((cue, index) => (
        <Sequence
          key={`fx-${index}`}
          from={cue.startFrame}
          durationInFrames={cue.frameCount}
          layout="none"
        >
          <Audio
            src={staticFile(cue.file)}
            volume={(f) => effectVolume(cue.startFrame + f)}
          />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
