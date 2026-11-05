import React from "react";
import { AbsoluteFill, Sequence, useCurrentFrame } from "remotion";
import type { WorkshopScene } from "./manifest";
import {
  GradientBackground,
  ParticlesBackground,
  PatternBackground,
} from "./workshop-end-card-ambient";
import {
  brandPair,
  lastSceneLook,
  type EndCardBackground as Kind,
} from "./workshop-end-card-backdrop";
import { LightRaysBackground } from "./workshop-end-card-light-rays";
import { SceneMedia } from "./workshop-scene-media";

/** What a background is drawn from: the brand's colours and the film's last scene. */
export type BackgroundProps = {
  kind: Exclude<Kind, "plain">;
  accent: string;
  secondary?: string | null;
  /** The film's last scene, and how many of its frames had played when the card began. */
  scene?: WorkshopScene | null;
  sceneFrom: number;
};

/**
 * What plays behind the closing card (FilmLook.endCardBackground). The last scene needs the
 * scene itself; a film without one gets the moving gradient instead.
 */
export const EndCardBackground: React.FC<BackgroundProps> = (props) => {
  const colours = brandPair(props.accent, props.secondary);
  if (props.kind === "last-scene" && props.scene) {
    return <LastSceneBackground scene={props.scene} from={props.sceneFrom} />;
  }
  if (props.kind === "pattern") {
    return <PatternBackground colours={colours} />;
  }
  if (props.kind === "particles") {
    return <ParticlesBackground colours={colours} />;
  }
  if (props.kind === "light-rays") {
    return <LightRaysBackground colours={colours} />;
  }
  return <GradientBackground colours={colours} />;
};

/**
 * The last scene keeps playing from where it was, out of focus, darker and pushing in slowly; a
 * clip that ends holds its last frame (SceneMedia).
 */
const LastSceneBackground: React.FC<{ scene: WorkshopScene; from: number }> = ({
  scene,
  from,
}) => {
  const frame = useCurrentFrame();
  const look = lastSceneLook(frame);
  return (
    <AbsoluteFill style={{ background: "#05080f", overflow: "hidden" }}>
      <AbsoluteFill
        style={{
          transform: `scale(${look.scale.toFixed(4)})`,
          filter: `blur(${look.blur.toFixed(1)}px) saturate(1.1)`,
        }}
      >
        <Sequence from={-Math.max(0, from)}>
          <SceneMedia scene={scene} muted />
        </Sequence>
      </AbsoluteFill>
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse at 50% 45%, rgba(5,8,15,${(look.dim * 0.7).toFixed(3)}) 0%, rgba(5,8,15,${Math.min(0.9, look.dim * 1.45).toFixed(3)}) 100%)`,
        }}
      />
    </AbsoluteFill>
  );
};
