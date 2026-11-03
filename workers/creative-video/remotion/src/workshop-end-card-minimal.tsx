import React from "react";
import {
  AbsoluteFill,
  Img,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { CtaLines } from "./workshop-end-card-cta";
import {
  ctaFontSize,
  ctaLinesOf,
  type EndCardProps,
} from "./workshop-end-card-layout";

const clamp = {
  extrapolateLeft: "clamp",
  extrapolateRight: "clamp",
} as const;

/**
 * The minimal card: white text on a plain dark ground, no pill, a thin accent line drawn out
 * from the centre between the logo and the call to action, and the website in grey.
 */
export const MinimalEndCard: React.FC<EndCardProps> = ({
  brand,
  accent,
  fontFamily,
}) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const unit = Math.min(width, height);
  const lines = ctaLinesOf(brand);
  const fontSize = ctaFontSize(lines, width * 0.78, unit * 0.06);
  const logoIn = interpolate(frame, [0, 14], [0, 1], clamp);
  const line = interpolate(frame, [6, 22], [0, 1], clamp);
  return (
    <AbsoluteFill
      style={{
        background: "#0b0d12",
        alignItems: "center",
        justifyContent: "center",
        gap: Math.round(unit * 0.045),
        fontFamily,
        color: "#ffffff",
      }}
    >
      {brand.logo ? (
        <Img
          src={staticFile(brand.logo)}
          style={{
            maxWidth: "40%",
            maxHeight: Math.round(height * 0.14),
            objectFit: "contain",
            opacity: logoIn,
          }}
        />
      ) : null}
      <div
        style={{
          width: Math.round(width * 0.34 * line),
          height: Math.max(2, Math.round(unit * 0.004)),
          background: accent,
        }}
      />
      {lines.length ? (
        <div
          dir="rtl"
          style={{
            fontWeight: 600,
            fontSize,
            lineHeight: 1.3,
            textAlign: "center",
            maxWidth: "86%",
          }}
        >
          <CtaLines lines={lines} delay={12} />
        </div>
      ) : null}
      {brand.ctaUrl ? (
        <div
          style={{
            color: "rgba(255,255,255,0.55)",
            fontWeight: 400,
            fontSize: Math.round(unit * 0.03),
            letterSpacing: 2,
            opacity: line,
          }}
        >
          {brand.ctaUrl}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
