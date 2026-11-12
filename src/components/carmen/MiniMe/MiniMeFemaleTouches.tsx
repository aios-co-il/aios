const LASH = "#0A1526";

/**
 * The female set's touches over the shared figure: lashes, blushed cheeks
 * and a bow in the skin's limb color. The mouth color is set by `MiniMe`.
 */
export function MiniMeFemaleTouches({ limb }: { limb: string }) {
  return (
    <g className="mini-me-female">
      <path
        d="M80 120 L70 110 M88 113 L83 101 M98 110 L98 97"
        stroke={LASH}
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d="M202 120 L212 110 M194 113 L199 101 M184 110 L184 97"
        stroke={LASH}
        strokeWidth="4"
        strokeLinecap="round"
      />
      <ellipse cx="80" cy="188" rx="15" ry="8" fill="#FF7FA8" opacity="0.5" />
      <ellipse cx="202" cy="188" rx="15" ry="8" fill="#FF7FA8" opacity="0.5" />
      <g transform="translate(70 76) rotate(-20)">
        <path
          d="M0 0 L-24 -13 L-22 13 Z"
          fill={limb}
          stroke={LASH}
          strokeOpacity="0.3"
          strokeWidth="2"
        />
        <path
          d="M0 0 L24 -13 L22 13 Z"
          fill={limb}
          stroke={LASH}
          strokeOpacity="0.3"
          strokeWidth="2"
        />
        <circle r="7" fill="#FFFFFF" opacity="0.9" />
      </g>
    </g>
  );
}
