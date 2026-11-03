import React from "react";
import { spring, useCurrentFrame, useVideoConfig } from "remotion";

/**
 * The call to action's lines, right to left, each entering after the one above it like the
 * film's motion captions: up, sharp and in place. `delay` is the frame the first line starts;
 * `from` scales each line from that size (1 for none), for a design that slams its text in.
 */
export const CtaLines: React.FC<{
  lines: string[];
  delay: number;
  from?: number;
}> = ({ lines, delay, from = 1 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <>
      {lines.map((line, index) => {
        const p = spring({
          frame: frame - delay - index * 5,
          fps,
          config: { damping: 14, mass: 0.45, stiffness: 190 },
        });
        const blur = (1 - Math.min(1, Math.max(0, p))) * 8;
        const scale = from + (1 - from) * p;
        return (
          <div
            key={index}
            dir="rtl"
            style={{
              whiteSpace: "nowrap",
              opacity: Math.min(1, p * 1.5),
              transform: `translateY(${((1 - p) * 0.5).toFixed(3)}em) scale(${scale.toFixed(3)})`,
              filter: blur > 0.2 ? `blur(${blur.toFixed(1)}px)` : undefined,
            }}
          >
            {line}
          </div>
        );
      })}
    </>
  );
};
