import { MINI_ME_OUTLINE as OUTLINE } from "./miniMePalette";
// Small objects a Mini Me holds in its free hand.

/** Coin for a Mini Me skin. */
export function Coin() {
  return (
    <g>
      <circle
        cx="12"
        cy="228"
        r="26"
        fill="#F2C14E"
        stroke="#A97C0C"
        strokeWidth="3"
      />
      <circle
        cx="12"
        cy="228"
        r="18"
        fill="none"
        stroke="#A97C0C"
        strokeWidth="2"
      />
      <text
        x="12"
        y="237"
        textAnchor="middle"
        fontSize="24"
        fontWeight="800"
        fill="#7A5A08"
      >
        ₪
      </text>
    </g>
  );
}

/** Target for a Mini Me skin. */
export function Target() {
  return (
    <g>
      <circle
        cx="8"
        cy="230"
        r="28"
        fill="#FFFFFF"
        stroke="#EF4444"
        strokeWidth="6"
      />
      <circle
        cx="8"
        cy="230"
        r="16"
        fill="none"
        stroke="#EF4444"
        strokeWidth="6"
      />
      <circle cx="8" cy="230" r="5" fill="#EF4444" />
      <path
        d="M8 230 L54 192"
        stroke="#0A1526"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d="M54 192 L48 182 M54 192 L64 194"
        stroke="#3B82F6"
        strokeWidth="5"
        strokeLinecap="round"
      />
    </g>
  );
}

/** Magnifier for a Mini Me skin. */
export function Magnifier({ handle }: { handle: string }) {
  return (
    <g>
      <path
        d="M22 224 L40 242"
        stroke={handle}
        strokeWidth="11"
        strokeLinecap="round"
      />
      <circle
        cx="2"
        cy="204"
        r="26"
        fill="#FFFFFF"
        fillOpacity="0.4"
        stroke="#C9D3DD"
        strokeWidth="7"
      />
      <path
        d="M-12 196 Q-6 186 6 184"
        stroke="#FFFFFF"
        strokeWidth="4"
        fill="none"
        strokeLinecap="round"
      />
    </g>
  );
}

/** Clipboard for a Mini Me skin. */
export function Clipboard({ tab, bar }: { tab: string; bar: string }) {
  return (
    <g transform="rotate(-10 14 232)">
      <rect
        x="-16"
        y="198"
        width="56"
        height="68"
        rx="6"
        fill="#FFFFFF"
        {...OUTLINE}
      />
      <rect x="0" y="192" width="24" height="11" rx="3" fill={tab} />
      <rect x="-6" y="242" width="9" height="16" fill={bar} />
      <rect x="7" y="230" width="9" height="28" fill={bar} />
      <rect x="20" y="218" width="9" height="40" fill="#40CE80" />
    </g>
  );
}
