const OUTLINE = "#0A1526";
const ARM = "M236 194 Q266 244 236 260 Q224 264 214 258";
const PINKY = "M219 226 C222 207 192 196 166 203";
const FIST =
  "M182 232 a7 7 0 0 1 13 0 a7 7 0 0 1 13 0 a7 7 0 0 1 12 0 L224 236 Q226 258 204 258 Q181 258 180 238 Z";
const THUMB = "M185 250 Q202 256 218 246";

/**
 * The Mini Me's signature: the near hand held up facing forward, three
 * fingers curled into a fist, and the pinky arcing from the far side of the
 * hand to the corner of the mouth. Outlined and shadowed so it reads on the
 * glass.
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
        strokeOpacity="0.4"
        strokeWidth="11"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d={PINKY}
        stroke={limb}
        strokeWidth="7.5"
        strokeLinecap="round"
        fill="none"
      />
      <g transform="rotate(-6 203 240)">
        <path
          d={FIST}
          fill={limb}
          stroke={OUTLINE}
          strokeOpacity="0.4"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        <path
          d="M195 233 V246 M208 233 V246"
          stroke={OUTLINE}
          strokeOpacity="0.4"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d={THUMB}
          stroke={OUTLINE}
          strokeOpacity="0.4"
          strokeWidth="10"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d={THUMB}
          stroke={limb}
          strokeWidth="6.5"
          strokeLinecap="round"
          fill="none"
        />
        <circle cx="188" cy="230" r="2.6" fill="#FFFFFF" opacity="0.6" />
      </g>
    </g>
  );
}
