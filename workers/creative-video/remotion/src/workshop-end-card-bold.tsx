import React from "react";
import {
  AbsoluteFill,
  Img,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { CtaLines } from "./workshop-end-card-cta";
import { glassFit } from "./workshop-end-card-glass";
import { GlassPanel } from "./workshop-end-card-glass-panel";
import {
  ctaFontSize,
  ctaLinesOf,
  type EndCardProps,
} from "./workshop-end-card-layout";
import { inkOn } from "./workshop-layout";

/**
 * The bold card: the whole frame in the accent colour, the call to action as large as its lines
 * allow and slammed in, the logo small above it on a plate of its own so it reads on any accent.
 */
export const BoldEndCard: React.FC<EndCardProps> = ({
  brand,
  accent,
  fontFamily,
  ground,
  glass,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const unit = Math.min(width, height);
  const ink = inkOn(accent);
  const lines = ctaLinesOf(brand);
  // GLYPH_EM is a safe average; the bold card spends that margin on size (renders: 72% wide).
  const fontSize = ctaFontSize(
    lines,
    width * 1.08 * glassFit(width, height, glass),
    unit * 0.13,
  );
  const logoIn = spring({ frame: frame - 16, fps, config: { damping: 15 } });
  const bar = spring({ frame: frame - 8, fps, config: { damping: 18 } });
  const gap = Math.round(unit * 0.06);
  // Over a background the accent is a wash it shows through, at the centre most of all.
  const wash = ground ? [100, 100] : [36, 60];
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(circle at 50% 45%, color-mix(in srgb, ${accent} ${wash[0]}%, transparent) 0%, color-mix(in srgb, color-mix(in srgb, ${accent} 78%, black) ${wash[1]}%, transparent) 100%)`,
        alignItems: "center",
        justifyContent: "center",
        gap,
        fontFamily,
        color: ink,
      }}
    >
      <GlassPanel glass={glass} gap={gap}>
        {brand.logo ? (
          <div
            style={{
              // Dark, like the classic card under it: a brand logo is drawn to read on dark.
              background: "rgba(5,8,15,0.88)",
              borderRadius: Math.round(unit * 0.03),
              padding: Math.round(unit * 0.025),
              opacity: logoIn,
              transform: `translateY(${((1 - logoIn) * -20).toFixed(1)}px)`,
              boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
            }}
          >
            <Img
              src={staticFile(brand.logo)}
              style={{
                display: "block",
                maxWidth: Math.round(width * 0.26),
                maxHeight: Math.round(height * 0.08),
                objectFit: "contain",
              }}
            />
          </div>
        ) : null}
        {lines.length ? (
          <div
            dir="rtl"
            style={{
              fontWeight: 900,
              fontSize,
              lineHeight: 1.12,
              textAlign: "center",
              maxWidth: glass ? "100%" : "92%",
              letterSpacing: "-0.01em",
            }}
          >
            <CtaLines lines={lines} delay={2} from={1.35} />
          </div>
        ) : null}
        <div
          style={{
            width: Math.round(width * 0.22 * bar),
            height: Math.max(4, Math.round(unit * 0.008)),
            borderRadius: 999,
            background: ink,
            opacity: 0.85,
          }}
        />
        {brand.ctaUrl ? (
          <div
            style={{
              fontWeight: 700,
              fontSize: Math.round(unit * 0.036),
              letterSpacing: 1,
              opacity: logoIn,
            }}
          >
            {brand.ctaUrl}
          </div>
        ) : null}
      </GlassPanel>
    </AbsoluteFill>
  );
};
