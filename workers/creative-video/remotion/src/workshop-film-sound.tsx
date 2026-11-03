/** The workshop film's sound: the narration, the music bed under the voice, and the effects. */
import React from "react";
import {
  Audio,
  Sequence,
  interpolate,
  staticFile,
  useVideoConfig,
} from "remotion";
import { type WorkshopFilmProps, type WorkshopMusicLoop } from "./manifest";

const clamp = {
  extrapolateLeft: "clamp",
  extrapolateRight: "clamp",
} as const;

export const FilmSound: React.FC<
  Pick<
    WorkshopFilmProps,
    | "narration"
    | "music"
    | "musicLoops"
    | "musicEnvelope"
    | "effects"
    | "effectsEnvelope"
  >
> = ({
  narration,
  music,
  musicLoops,
  musicEnvelope,
  effects,
  effectsEnvelope,
}) => {
  const { durationInFrames } = useVideoConfig();
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
  return (
    <>
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
    </>
  );
};

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
