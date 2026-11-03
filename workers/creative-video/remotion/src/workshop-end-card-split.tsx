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
import {
  ctaFontSize,
  ctaLinesOf,
  type EndCardProps,
} from "./workshop-end-card-layout";
import { inkOn } from "./workshop-layout";

/**
 * The split card: the logo on a dark half (a brand logo is drawn to read on dark, as on the
 * classic card), the call to action on an accent half. A tall frame
 * splits top and bottom; a wide one side by side, the logo on the right where Hebrew starts.
 * The accent half slides in over the dark one.
 */
export const SplitEndCard: React.FC<EndCardProps> = ({
  brand,
  accent,
  fontFamily,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const unit = Math.min(width, height);
  const wide = width > height;
  const lines = ctaLinesOf(brand);
  const half = wide ? width / 2 : width;
  const fontSize = ctaFontSize(lines, half * 0.98, unit * 0.075);
  const slide = spring({ frame, fps, config: { damping: 17, mass: 0.6 } });
  const logoIn = spring({ frame: frame - 6, fps, config: { damping: 14 } });
  const offset = (1 - slide) * 100;
  return (
    <AbsoluteFill
      style={{
        flexDirection: wide ? "row-reverse" : "column",
        background: `radial-gradient(circle at 50% 50%, ${brand.secondaryColor || "#10202e"} 0%, #05080f 85%)`,
        fontFamily,
      }}
    >
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {brand.logo ? (
          <Img
            src={staticFile(brand.logo)}
            style={{
              maxWidth: wide ? "70%" : "62%",
              maxHeight: Math.round((wide ? height : height / 2) * 0.55),
              objectFit: "contain",
              opacity: logoIn,
              transform: `scale(${(0.9 + 0.1 * logoIn).toFixed(3)})`,
            }}
          />
        ) : null}
      </div>
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: Math.round(unit * 0.035),
          background: accent,
          color: inkOn(accent),
          transform: wide
            ? `translateX(${(-offset).toFixed(2)}%)`
            : `translateY(${offset.toFixed(2)}%)`,
          boxShadow: "0 0 40px rgba(0,0,0,0.25)",
        }}
      >
        {lines.length ? (
          <div
            dir="rtl"
            style={{
              fontWeight: 800,
              fontSize,
              lineHeight: 1.2,
              textAlign: "center",
              maxWidth: "90%",
            }}
          >
            <CtaLines lines={lines} delay={10} />
          </div>
        ) : null}
        {brand.ctaUrl ? (
          <div
            style={{
              fontWeight: 600,
              fontSize: Math.round(unit * 0.032),
              letterSpacing: 1,
              opacity: logoIn * 0.85,
            }}
          >
            {brand.ctaUrl}
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};
