import React from "react";
import {
  AbsoluteFill,
  Img,
  interpolate,
  spring,
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
import { accentColours } from "./workshop-layout";

/**
 * The classic closing card (the default): the brand logo over a soft glow of the accent, the
 * call to action in an accent pill under it, and the website.
 */
export const ClassicEndCard: React.FC<EndCardProps> = ({
  brand,
  accent,
  fontFamily,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const unit = Math.min(width, height);
  const logoIn = spring({ frame, fps, config: { damping: 14, mass: 0.6 } });
  const ctaIn = spring({
    frame: frame - 10,
    fps,
    config: { damping: 16, mass: 0.5 },
  });
  const glow = interpolate(frame, [0, 75], [0.25, 0.45], {
    extrapolateRight: "clamp",
  });
  const second = brand.secondaryColor || "#07111c";
  const lines = ctaLinesOf(brand);
  const fontSize = ctaFontSize(lines, width * 0.8, unit * 0.058);
  const colours = accentColours(accent);
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(circle at 50% 42%, ${second} 0%, #05080f 78%)`,
        alignItems: "center",
        justifyContent: "center",
        gap: Math.round(unit * 0.05),
        fontFamily,
      }}
    >
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle at 50% 42%, ${accent} 0%, transparent 46%)`,
          opacity: glow * 0.35,
        }}
      />
      {brand.logo ? (
        <Img
          src={staticFile(brand.logo)}
          style={{
            maxWidth: "58%",
            maxHeight: Math.round(height * 0.26),
            objectFit: "contain",
            transform: `scale(${0.85 + 0.15 * logoIn})`,
            opacity: logoIn,
            filter: "drop-shadow(0 12px 32px rgba(0,0,0,0.45))",
          }}
        />
      ) : null}
      {lines.length ? (
        <div
          dir="rtl"
          style={{
            background: colours.fill,
            color: colours.onFill,
            fontWeight: 800,
            fontSize,
            lineHeight: 1.22,
            textAlign: "center",
            maxWidth: "88%",
            padding: `${Math.round(unit * 0.022)}px ${Math.round(unit * (lines.length > 1 ? 0.04 : 0.05))}px`,
            borderRadius: lines.length > 1 ? Math.round(unit * 0.04) : 999,
            opacity: ctaIn,
            transform: `translateY(${(1 - ctaIn) * 30}px)`,
            boxShadow: `0 10px 40px ${colours.glow}`,
          }}
        >
          <CtaLines lines={lines} delay={14} />
        </div>
      ) : null}
      {brand.ctaUrl ? (
        <div
          style={{
            color: "rgba(255,255,255,0.86)",
            fontWeight: 600,
            fontSize: Math.round(unit * 0.034),
            letterSpacing: 1,
            opacity: ctaIn,
          }}
        >
          {brand.ctaUrl}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
