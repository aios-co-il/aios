import React from "react";
import {
  AbsoluteFill,
  Audio,
  Img,
  Sequence,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
  staticFile,
} from "remotion";
export type SceneKind =
  "sink" | "chaos" | "arrival" | "lift" | "surface" | "cta";
export type Scene = {
  id: string;
  durationFrames: number;
  kind: SceneKind;
  caption: string;
  background?: string;
  website?: string;
  carmen?: string;
  voiceover?: string;
};
export type CarmenVideoProps = {
  title: string;
  scenes: Scene[];
  music?: string;
};
const green = "#08F467";
const ocean =
  "radial-gradient(ellipse at 50% 0%, #0e6574 0%, #063344 35%, #061426 85%)";
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const SceneView: React.FC<{ scene: Scene }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const progress = frame / scene.durationFrames;
  const enter = spring({ frame, fps, config: { damping: 200 } });
  const rise = interpolate(
    progress,
    [0, 1],
    [height * 0.7, -height * 0.28],
    clamp,
  );
  const sink = interpolate(
    progress,
    [0, 1],
    [-height * 0.12, height * 0.3],
    clamp,
  );
  const websiteY =
    scene.kind === "sink" || scene.kind === "chaos"
      ? sink
      : scene.kind === "lift" || scene.kind === "surface"
        ? rise
        : height * 0.1;
  const zoom = interpolate(progress, [0, 1], [1, 1.12], clamp);
  const inflate =
    scene.kind === "arrival"
      ? interpolate(progress, [0.25, 0.85], [0.1, 1], clamp)
      : 1;
  const characterX = interpolate(
    progress,
    [0, 0.65],
    [width * 0.8, width * 0.08],
    clamp,
  );
  return (
    <AbsoluteFill
      style={{
        background:
          scene.kind === "surface" || scene.kind === "cta"
            ? "linear-gradient(#67c9d5 0%,#d5f6ef 47%,#065067 48%,#031a30 100%)"
            : ocean,
        overflow: "hidden",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <AbsoluteFill style={{ transform: `scale(${zoom})` }}>
        {scene.background ? (
          <Img
            src={scene.background}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <AbsoluteFill
            style={{
              background:
                "radial-gradient(circle at 45% 5%, #33c8cb44, transparent 60%)",
            }}
          />
        )}
        {Array.from({ length: 22 }, (_, i) => {
          const x = (i * 139 + 53) % width;
          const y = (i * 211 + frame * (1 + (i % 3)) * 2) % (height + 150);
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: x,
                top: height - y,
                width: 6 + (i % 4) * 6,
                height: 6 + (i % 4) * 6,
                border: "2px solid #b9faff77",
                borderRadius: "50%",
                opacity: 0.25 + (i % 5) * 0.1,
              }}
            />
          );
        })}
        {scene.kind !== "cta" && (
          <div
            style={{
              position: "absolute",
              top: "32%",
              left: "11%",
              width: "78%",
              height: "29%",
              transform: `translateY(${websiteY}px) rotate(${scene.kind === "sink" ? interpolate(progress, [0, 1], [-8, 8]) : 0}deg)`,
              filter: "drop-shadow(0 24px 40px #0009)",
            }}
          >
            {scene.website ? (
              <Img
                src={scene.website}
                style={{ width: "100%", height: "100%", objectFit: "contain" }}
              />
            ) : (
              <div
                style={{
                  height: "100%",
                  background: "linear-gradient(140deg,#164257,#05172b)",
                  border: "8px solid #64d6db",
                  borderRadius: 28,
                  boxShadow: "0 0 50px #03d0cc55",
                  padding: 32,
                }}
              >
                <div style={{ display: "flex", gap: 15, marginBottom: 30 }}>
                  {[0, 1, 2].map((n) => (
                    <span
                      key={n}
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: "50%",
                        background: green,
                      }}
                    />
                  ))}
                </div>
                <div
                  style={{
                    fontSize: 58,
                    color: "white",
                    fontWeight: 900,
                    textAlign: "center",
                  }}
                >
                  YOUR WEBSITE
                </div>
                <div
                  style={{
                    height: 14,
                    margin: "30px 0",
                    background: "#45c2d488",
                  }}
                />
                <div style={{ height: 14, background: "#45c2d444" }} />
              </div>
            )}
            {(scene.kind === "arrival" ||
              scene.kind === "lift" ||
              scene.kind === "surface") &&
              [-1, 1].map((side) => (
                <div
                  key={side}
                  style={{
                    position: "absolute",
                    left: side === -1 ? "4%" : "69%",
                    bottom: -90,
                    width: "28%",
                    height: 120,
                    background:
                      "radial-gradient(ellipse at 50% 30%,#b6ffd7,#08f467 60%,#046b40)",
                    borderRadius: "48%",
                    boxShadow: "0 0 35px #08f46799",
                    transform: `scale(${inflate})`,
                  }}
                />
              ))}
          </div>
        )}
        {(scene.kind === "arrival" || scene.kind === "lift") && (
          <div
            style={{
              position: "absolute",
              top: "25%",
              left: characterX,
              transform: `translateY(${Math.sin(frame / 16) * 15}px)`,
              width: "40%",
              height: "34%",
            }}
          >
            {scene.carmen ? (
              <Img
                src={scene.carmen}
                style={{ width: "100%", height: "100%", objectFit: "contain" }}
              />
            ) : (
              <div
                style={{
                  textAlign: "center",
                  fontSize: 180,
                  filter: "drop-shadow(0 0 30px #08f467)",
                }}
              >
                🕵️‍♀️
              </div>
            )}
          </div>
        )}
      </AbsoluteFill>
      <div
        dir="rtl"
        style={{
          position: "absolute",
          bottom: scene.kind === "cta" ? "25%" : "8%",
          left: "6%",
          width: "88%",
          padding: "30px 24px",
          fontSize: scene.kind === "cta" ? 67 : 57,
          fontWeight: 900,
          textAlign: "center",
          color: "white",
          textShadow: "0 5px 15px #000",
          opacity: enter,
          background:
            "linear-gradient(90deg,transparent,#061a2bbb,transparent)",
          borderRadius: 20,
        }}
      >
        {scene.caption}
      </div>
      {scene.kind === "cta" && (
        <div
          style={{
            position: "absolute",
            top: "30%",
            width: "100%",
            textAlign: "center",
            fontSize: 78,
            fontWeight: 900,
            color: green,
            letterSpacing: 3,
          }}
        >
          {"CARMEN"}
          <div style={{ fontSize: 40, color: "white" }}>MARKETING OS</div>
        </div>
      )}
      {scene.voiceover && <Audio src={scene.voiceover} />}
    </AbsoluteFill>
  );
};
export const CarmenVideo: React.FC<CarmenVideoProps> = ({ scenes, music }) => {
  let offset = 0;
  return (
    <AbsoluteFill style={{ background: "#0A1526" }}>
      {scenes.map((scene) => {
        const from = offset;
        offset += scene.durationFrames;
        return (
          <Sequence
            key={scene.id}
            from={from}
            durationInFrames={scene.durationFrames}
          >
            <SceneView scene={scene} />
          </Sequence>
        );
      })}
      {music && <Audio src={music} volume={0.25} />}
    </AbsoluteFill>
  );
};
