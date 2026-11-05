/**
 * A scene's animated graphics (workshop-overlays.ts), drawn over its picture and under its text
 * in the brand's accent colour. The film draws it inside the scene, so it enters and leaves with
 * the scene's transition.
 */
import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { accentColours, captionLayout } from "./workshop-layout";
import { overlayPieces, type Piece } from "./workshop-overlay-pieces";
import {
  companionColour,
  lightLeak,
  lowerThirdIn,
  rgba,
  type SceneOverlay,
} from "./workshop-overlays";

export const SceneOverlayView: React.FC<{
  overlay: SceneOverlay;
  sceneId: string;
  /** Frames of the scene's own entrance transition, before its first frame. */
  enter: number;
  accent: string;
  /** The scene shows text at the bottom: the lower third frames it, and shows only then. */
  hasText: boolean;
}> = ({ overlay, sceneId, enter, accent, hasText }) => {
  const frame = useCurrentFrame() - enter;
  const { width, height, fps, durationInFrames } = useVideoConfig();
  const frames = durationInFrames - enter;
  if (overlay === "light-leak") {
    return (
      <LightLeak
        p={frame / Math.max(1, frames)}
        sceneId={sceneId}
        accent={accent}
      />
    );
  }
  if (overlay === "lower-third") {
    return hasText ? (
      <LowerThird shown={lowerThirdIn(frame, frames)} accent={accent} />
    ) : null;
  }
  const pieces = overlayPieces(overlay, sceneId, frame / fps, {
    width,
    height,
    fps,
  });
  const tones = [
    "#ffffff",
    accentColours(accent).text,
    companionColour(accent),
  ];
  const Draw =
    overlay === "bubbles" ? Bubble : overlay === "confetti" ? Confetto : Mote;
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {pieces.map((piece, index) => (
        <Draw key={index} piece={piece} colour={tones[piece.tone]} />
      ))}
    </AbsoluteFill>
  );
};

const at = (piece: Piece, w: number, h: number): React.CSSProperties => ({
  position: "absolute",
  left: piece.x - w / 2,
  top: piece.y - h / 2,
  width: w,
  height: h,
  opacity: piece.opacity,
});

/** A bubble: a clear ring with a highlight, lighter at its edge. */
const Bubble = ({ piece }: { piece: Piece; colour: string }) => (
  <div
    style={{
      ...at(piece, piece.size, piece.size),
      borderRadius: "50%",
      border: `${Math.max(1, piece.size * 0.07).toFixed(1)}px solid rgba(255,255,255,0.9)`,
      background:
        "radial-gradient(circle at 32% 30%, rgba(255,255,255,0.85) 0 9%, rgba(255,255,255,0.08) 22%, rgba(180,225,255,0.12) 70%, rgba(255,255,255,0.3) 100%)",
    }}
  />
);

/** A floating mote of dust or, soft, a bokeh disc. */
const Mote = ({ piece, colour }: { piece: Piece; colour: string }) => (
  <div
    style={{
      ...at(piece, piece.size, piece.size),
      borderRadius: "50%",
      background: piece.soft
        ? `radial-gradient(circle, ${colour} 0%, transparent 70%)`
        : `radial-gradient(circle, #ffffff 0 30%, ${colour} 55%, transparent 75%)`,
      mixBlendMode: "screen",
    }}
  />
);

/** A confetti strip, spinning and tilting as it falls. */
const Confetto = ({ piece, colour }: { piece: Piece; colour: string }) => (
  <div
    style={{
      ...at(piece, piece.size * 0.55, piece.size),
      background: colour,
      borderRadius: piece.size * 0.08,
      transform: `rotate(${piece.rotate.toFixed(1)}deg) scaleY(${piece.flip.toFixed(3)})`,
      boxShadow: "0 1px 2px rgba(0,0,0,0.25)",
    }}
  />
);

/** Two warm glows sweeping across the picture, swelling mid-scene. */
const LightLeak: React.FC<{ p: number; sceneId: string; accent: string }> = ({
  p,
  sceneId,
  accent,
}) => {
  const leak = lightLeak(p, sceneId);
  const [warm, tint] = leak.glows;
  return (
    <AbsoluteFill style={{ pointerEvents: "none", opacity: leak.opacity }}>
      <AbsoluteFill
        style={{
          mixBlendMode: "soft-light",
          background: `radial-gradient(ellipse ${warm.radius}% ${warm.radius * 0.8}% at ${warm.x}% ${warm.y}%, rgba(255,190,110,1), rgba(255,120,40,0.6) 40%, transparent 75%)`,
        }}
      />
      <AbsoluteFill
        style={{
          mixBlendMode: "screen",
          background: `radial-gradient(ellipse ${warm.radius * 0.6}% ${warm.radius * 0.45}% at ${warm.x}% ${warm.y}%, rgba(255,200,140,0.35), transparent 70%), radial-gradient(ellipse ${tint.radius}% ${tint.radius * 0.7}% at ${tint.x}% ${tint.y}%, ${rgba(accent, 0.4)}, transparent 70%)`,
        }}
      />
    </AbsoluteFill>
  );
};

/** The accent bar in the bottom third, behind where the scene's text sits, in from the right. */
const LowerThird: React.FC<{ shown: number; accent: string }> = ({
  shown,
  accent,
}) => {
  const { width, height } = useVideoConfig();
  const layout = captionLayout(width, height);
  if (shown <= 0) return null;
  const band = Math.round(layout.box * 1.35);
  return (
    <div
      style={{
        position: "absolute",
        right: 0,
        bottom: layout.bottom - Math.round(layout.box * 0.2),
        width: width * 0.94,
        height: band,
        transform: `translateX(${((1 - shown) * 105).toFixed(1)}%)`,
        background: `linear-gradient(270deg, ${rgba(accent, 0.82)} 0%, ${rgba(accent, 0.5)} 55%, ${rgba(accent, 0)} 100%)`,
        borderTop: `${Math.max(3, Math.round(height * 0.004))}px solid ${accent}`,
      }}
    />
  );
};
