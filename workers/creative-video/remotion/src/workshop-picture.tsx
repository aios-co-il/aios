/** One scene of the workshop film: its picture under the camera move, its text and its voice. */
import React from "react";
import {
  AbsoluteFill,
  Audio,
  Easing,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import {
  type WorkshopMove,
  type WorkshopScene,
  type WorkshopTransition,
} from "./manifest";
import { SceneMedia } from "./workshop-scene-media";
import { SceneTextLayer } from "./workshop-scene-text-layer";
import { SkinSweep } from "./workshop-skin";
import { skinEnter, skinExit } from "./workshop-transition";
import { transitionLook } from "./workshop-transitions";
import { TransitionFilter } from "./workshop-transition-filter";

export type TitleMode = "none" | "kicker" | "card";

export const Picture: React.FC<{
  scene: WorkshopScene;
  enter: number;
  /** Frames of the next scene's transition over this scene's end, and that transition. */
  exitFrames: number;
  exitType?: WorkshopTransition;
  accent: string;
  /** The scene's on-screen text to draw ("" for none), at the bottom or at the top. */
  caption: string;
  /** "top" over spoken captions; "motion": motion graphics where captions would sit. */
  captionAt: "top" | "bottom" | "motion";
  title: TitleMode;
}> = (props) => {
  const { scene, enter, exitFrames, accent, caption, captionAt, title } = props;
  const frame = useCurrentFrame();
  const { durationInFrames, fps, width } = useVideoConfig();
  const progress = interpolate(
    frame,
    [0, Math.max(1, durationInFrames - 1)],
    [0, 1],
    { ...clamp, easing: Easing.inOut(Easing.cubic) },
  );
  const { scale, x, y } = camera(scene.move || "push", progress);
  const sheen = interpolate(progress, [0, 1], [-40, 140]);
  const kicker = title !== "none" ? (scene.kicker || "").trim() : "";
  const skin =
    scene.transition === "skin" && enter > 0
      ? skinEnter(frame, enter, fps)
      : null;
  const skinOut = props.exitType === "skin" ? exitFrames : 0;
  const out = skinExit(frame, durationInFrames, skinOut);
  // Every other transition, in and out (whip, ripple and glitch through an SVG filter).
  const fxId = `fx-${scene.id.replace(/[^A-Za-z0-9_-]/g, "_")}`;
  const look = transitionLook({
    type: scene.transition || "crossfade",
    enter,
    exitType: props.exitType,
    exitFrames,
    frame,
    total: durationInFrames,
    width,
    id: fxId,
  });
  const punch = (skin?.scale ?? 1) * out.scale;
  const blur = Math.max(skin?.blur ?? 0, out.blur);
  const filters = [
    out.brightness !== 1 ? `brightness(${out.brightness.toFixed(3)})` : "",
    blur > 0.2 ? `blur(${blur.toFixed(1)}px)` : "",
  ].filter(Boolean);
  return (
    <AbsoluteFill>
      {look.fx ? <TransitionFilter id={fxId} fx={look.fx} /> : null}
      <AbsoluteFill
        style={{
          background: "#07111c",
          ...look.style,
          ...(skin ? { opacity: skin.shown ? 1 : 0 } : {}),
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
            <SceneMedia scene={scene} />
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
        <SceneTextLayer
          scene={scene}
          enter={enter}
          accent={accent}
          caption={caption}
          captionAt={captionAt}
          title={title}
          kicker={kicker}
        />
      </AbsoluteFill>
      {scene.voice ? (
        <Sequence from={enter} layout="none">
          <Audio src={staticFile(scene.voice)} />
        </Sequence>
      ) : null}
    </AbsoluteFill>
  );
};

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
