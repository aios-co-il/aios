const OUTLINE = "#0A1526";
const ARM = "M236 192 Q264 240 244 258 Q228 264 210 252";
const PINKY = "M184 229 Q169 222 165 204";

/**
 * The Mini Me's signature: the near hand raised in a loose fist beside the
 * face, wrist tilted, with only the pinky lifted to the corner of the mouth.
 * Outlined and shadowed so it reads on the glass.
 */
export function PinkyHand({ limb, shadow }: { limb: string; shadow: string }) {
  return (
    <g filter={`url(#${shadow})`}>
      <path
        d={ARM}
        stroke={OUTLINE}
        strokeOpacity="0.3"
        strokeWidth="22"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d={ARM}
        stroke={limb}
        strokeWidth="17"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d={PINKY}
        stroke={OUTLINE}
        strokeOpacity="0.38"
        strokeWidth="12.5"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d={PINKY}
        stroke={limb}
        strokeWidth="8.5"
        strokeLinecap="round"
        fill="none"
      />
      <g transform="rotate(-35 196 241)">
        <rect
          x="178"
          y="226"
          width="36"
          height="30"
          rx="13"
          fill={limb}
          stroke={OUTLINE}
          strokeOpacity="0.38"
          strokeWidth="2.5"
        />
        <path
          d="M180 235 q7 3 14 0 M180 243 q7 3 14 0 M181 251 q6 2.5 12 0"
          stroke={OUTLINE}
          strokeOpacity="0.4"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
        />
        <ellipse
          cx="205"
          cy="230"
          rx="10"
          ry="6"
          fill={limb}
          stroke={OUTLINE}
          strokeOpacity="0.38"
          strokeWidth="2"
        />
        <circle cx="186" cy="231" r="3.2" fill="#FFFFFF" opacity="0.55" />
      </g>
    </g>
  );
}
