import React from "react";
import type { TransitionFx } from "./workshop-transition-fx";

/** Keeps only one colour channel of the picture (with its alpha). */
const CHANNEL = {
  red: "1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0",
  green: "0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0",
  blue: "0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0",
};

/**
 * The SVG filter a whip, ripple or glitch draws through (workshop-transition-fx.ts): a
 * sideways blur, a water-like displacement, or horizontal slices shifted with the red and blue
 * channels pulled apart. The scene's style points at it by `id`.
 */
export const TransitionFilter: React.FC<{ id: string; fx: TransitionFx }> = ({
  id,
  fx,
}) => (
  <svg
    width={0}
    height={0}
    style={{ position: "absolute" }}
    aria-hidden
    focusable={false}
  >
    <defs>
      <filter
        id={id}
        x="-5%"
        y="-5%"
        width="110%"
        height="110%"
        colorInterpolationFilters="sRGB"
      >
        {fx.blur > 0.2 ? (
          <feGaussianBlur
            in="SourceGraphic"
            stdDeviation={`${fx.blur.toFixed(1)} 0`}
            edgeMode="duplicate"
          />
        ) : fx.ripple > 0.2 ? (
          <Ripple fx={fx} />
        ) : (
          <Glitch fx={fx} />
        )}
      </filter>
    </defs>
  </svg>
);

/** Waves that drift as the phase moves, displacing the picture less and less. */
const Ripple: React.FC<{ fx: TransitionFx }> = ({ fx }) => {
  const drift = Math.sin(fx.phase / 3) * 0.002;
  return (
    <>
      <feTurbulence
        type="turbulence"
        baseFrequency={`${(0.01 + drift).toFixed(5)} ${(0.028 - drift).toFixed(5)}`}
        numOctaves={2}
        seed={Math.floor(fx.phase / 2) + 1}
        result="waves"
      />
      <feDisplacementMap
        in="SourceGraphic"
        in2="waves"
        scale={fx.ripple.toFixed(1)}
        xChannelSelector="R"
        yChannelSelector="G"
      />
    </>
  );
};

/** Bands of noise (constant across, varying down) shift slices; then the colours split. */
const Glitch: React.FC<{ fx: TransitionFx }> = ({ fx }) => (
  <>
    <feTurbulence
      type="fractalNoise"
      baseFrequency="0 0.035"
      numOctaves={1}
      seed={fx.seed}
      result="noise"
    />
    <feComponentTransfer in="noise" result="bands">
      <feFuncR type="discrete" tableValues="0.5 0.5 0 0.5 1 0.5 0.5 0.15 0.5" />
      <feFuncG type="discrete" tableValues="0.5" />
    </feComponentTransfer>
    <feDisplacementMap
      in="SourceGraphic"
      in2="bands"
      scale={fx.slice.toFixed(1)}
      xChannelSelector="R"
      yChannelSelector="G"
      result="sliced"
    />
    <feColorMatrix in="sliced" type="matrix" values={CHANNEL.red} result="r" />
    <feOffset in="r" dx={fx.split.toFixed(1)} result="red" />
    <feColorMatrix
      in="sliced"
      type="matrix"
      values={CHANNEL.green}
      result="green"
    />
    <feColorMatrix in="sliced" type="matrix" values={CHANNEL.blue} result="b" />
    <feOffset in="b" dx={(-fx.split).toFixed(1)} result="blue" />
    <feBlend in="red" in2="green" mode="screen" result="rg" />
    <feBlend in="rg" in2="blue" mode="screen" />
  </>
);
