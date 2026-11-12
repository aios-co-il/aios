import { MINI_ME_OUTLINE as OUTLINE } from "./miniMePalette";
// What a Mini Me wears: drawn over the face.

/** Pencil for a Mini Me skin. */
export function Pencil() {
  return (
    <g transform="rotate(38 214 64)">
      <rect
        x="206"
        y="18"
        width="16"
        height="86"
        rx="3"
        fill="#FFD36E"
        {...OUTLINE}
      />
      <rect x="206" y="18" width="16" height="14" rx="3" fill="#F4A6C8" />
      <path d="M206 104 L214 124 L222 104 Z" fill="#F5DDBE" />
      <path d="M211 116 L214 124 L217 116 Z" fill="#0A1526" />
    </g>
  );
}

/** Beret for a Mini Me skin. */
export function Beret() {
  return (
    <g>
      <ellipse
        cx="128"
        cy="54"
        rx="72"
        ry="20"
        fill="#1A1A2E"
        transform="rotate(-8 128 54)"
      />
      <circle cx="134" cy="32" r="7" fill="#1A1A2E" />
    </g>
  );
}

/** Headphones for a Mini Me skin. */
export function Headphones({ cup }: { cup: string }) {
  return (
    <g>
      <path
        d="M50 140 Q50 28 140 28 Q230 28 230 140"
        stroke="#1A1A2E"
        strokeWidth="10"
        fill="none"
        strokeLinecap="round"
      />
      <rect
        x="30"
        y="120"
        width="30"
        height="46"
        rx="13"
        fill={cup}
        stroke="#1A1A2E"
        strokeWidth="4"
      />
      <rect
        x="220"
        y="120"
        width="30"
        height="46"
        rx="13"
        fill={cup}
        stroke="#1A1A2E"
        strokeWidth="4"
      />
    </g>
  );
}

/** CodeGlasses for a Mini Me skin. */
export function CodeGlasses() {
  return (
    <g>
      <rect
        x="70"
        y="106"
        width="70"
        height="66"
        rx="16"
        fill="#FFFFFF"
        fillOpacity="0.12"
        stroke="#0A1526"
        strokeWidth="6"
      />
      <rect
        x="142"
        y="106"
        width="70"
        height="66"
        rx="16"
        fill="#FFFFFF"
        fillOpacity="0.12"
        stroke="#0A1526"
        strokeWidth="6"
      />
      <path
        d="M70 126 L48 118 M212 126 L234 118"
        stroke="#0A1526"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <rect x="106" y="230" width="68" height="28" rx="14" fill="#0A1526" />
      <text
        x="140"
        y="250"
        textAnchor="middle"
        fontFamily="ui-monospace, monospace"
        fontSize="17"
        fontWeight="700"
        fill="#FFFFFF"
      >
        {"</>"}
      </text>
    </g>
  );
}
