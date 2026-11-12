/**
 * The Mini Me's signature: the near hand with its pinky at the corner of
 * the mouth, outlined and shadowed so it reads on the glass.
 */
export function PinkyHand({ limb, shadow }: { limb: string; shadow: string }) {
  return (
    <g filter={`url(#${shadow})`}>
      <path
        d="M234 182 Q236 220 204 232"
        stroke="#0A1526"
        strokeOpacity="0.3"
        strokeWidth="24"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M234 182 Q236 220 204 232"
        stroke={limb}
        strokeWidth="19"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M188 220 L167 207"
        stroke="#0A1526"
        strokeOpacity="0.35"
        strokeWidth="14"
        strokeLinecap="round"
      />
      <path
        d="M188 220 L167 207"
        stroke={limb}
        strokeWidth="10"
        strokeLinecap="round"
      />
      <circle
        cx="196"
        cy="230"
        r="19"
        fill={limb}
        stroke="#0A1526"
        strokeOpacity="0.35"
        strokeWidth="2.5"
      />
      <circle cx="190" cy="223" r="4" fill="#FFFFFF" opacity="0.55" />
    </g>
  );
}
