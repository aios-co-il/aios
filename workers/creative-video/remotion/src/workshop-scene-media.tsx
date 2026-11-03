import React from "react";
import {
  AbsoluteFill,
  Freeze,
  Img,
  OffthreadVideo,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";
import type { WorkshopScene } from "./manifest";

/**
 * A Workshop scene's picture without its camera, text or grade: its clip (and the skin's move
 * after it), else its still, else a dark ground. The film draws it in each scene
 * (workshop-film.tsx) and again behind the closing card (workshop-end-card-background.tsx),
 * muted there because the scene's own sound has already played.
 */
export const SceneMedia: React.FC<{
  scene: WorkshopScene;
  muted?: boolean;
}> = ({ scene, muted = false }) => {
  if (scene.clip) {
    return (
      <>
        <Clip scene={scene} muted={muted} />
        {scene.moveClip ? (
          <Sequence from={Math.max(0, scene.moveFrom ?? 0)}>
            <MoveClip scene={scene} />
          </Sequence>
        ) : null}
      </>
    );
  }
  if (scene.still && scene.fit === "contain") {
    return <ContainedStill src={staticFile(scene.still)} />;
  }
  if (scene.still) {
    return <Img src={staticFile(scene.still)} style={cover} />;
  }
  return (
    <AbsoluteFill
      style={{
        background: "radial-gradient(circle at 50% 30%, #164257, #07111c 70%)",
      }}
    />
  );
};

const clamp = {
  extrapolateLeft: "clamp",
  extrapolateRight: "clamp",
} as const;

const cover = { width: "100%", height: "100%", objectFit: "cover" } as const;

/**
 * A finished design (an ad or poster with its own text) is shown whole: a blurred copy fills the
 * frame behind it, so a 4:5 poster in a 9:16 film keeps its sides instead of being cropped.
 */
const ContainedStill: React.FC<{ src: string }> = ({ src }) => (
  <AbsoluteFill>
    <AbsoluteFill>
      <Img
        src={src}
        style={{
          ...cover,
          filter: "blur(40px) brightness(0.6)",
          transform: "scale(1.15)",
        }}
      />
    </AbsoluteFill>
    <AbsoluteFill>
      <Img src={src} style={{ ...cover, objectFit: "contain" }} />
    </AbsoluteFill>
  </AbsoluteFill>
);

/** A clip shorter than its scene holds its last frame instead of going black. */
const Clip: React.FC<{ scene: WorkshopScene; muted: boolean }> = ({
  scene,
  muted,
}) => {
  const frame = useCurrentFrame();
  const volume = Math.max(0, Math.min(1, scene.clipVolume ?? 0));
  const video = (silent: boolean) => (
    <OffthreadVideo
      src={staticFile(scene.clip || "")}
      muted={silent || muted || volume === 0}
      volume={volume}
      style={cover}
    />
  );
  const length = scene.clipFrames ?? 0;
  if (length > 0 && frame >= length) {
    return <Freeze frame={Math.max(0, length - 1)}>{video(true)}</Freeze>;
  }
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
