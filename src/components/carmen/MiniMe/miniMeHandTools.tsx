import { MINI_ME_OUTLINE as OUTLINE } from "./miniMePalette";
// Work tools a Mini Me holds in its free hand.

/** Megaphone for a Mini Me skin. */
export function Megaphone() {
  return (
    <g transform="rotate(-20 38 230)">
      <path
        d="M30 218 L-14 200 L-14 260 L30 242 Z"
        fill="#E6ECF2"
        {...OUTLINE}
      />
      <rect x="26" y="220" width="12" height="20" rx="3" fill="#C9D3DD" />
      <path
        d="M-22 212 Q-32 230 -22 248"
        stroke="#40CE80"
        strokeWidth="4"
        fill="none"
        strokeLinecap="round"
      />
    </g>
  );
}

/** Clapper for a Mini Me skin. */
export function Clapper() {
  return (
    <g transform="rotate(-12 20 232)">
      <rect x="-10" y="222" width="56" height="40" rx="4" fill="#1A1A2E" />
      <path d="M-10 222 L44 208 L46 219 L-8 233 Z" fill="#FFFFFF" />
      <path
        d="M2 218 L8 229 M18 214 L24 225 M34 210 L40 221"
        stroke="#1A1A2E"
        strokeWidth="4"
      />
    </g>
  );
}

/** Palette for a Mini Me skin. */
export function Palette() {
  return (
    <g>
      <path
        d="M-12 232 C-12 204 28 196 52 212 C66 222 56 238 44 236 C34 234 34 250 24 256 C8 266 -12 254 -12 232 Z"
        fill="#F5E6D3"
        {...OUTLINE}
      />
      <circle cx="2" cy="226" r="6" fill="#EF4444" />
      <circle cx="20" cy="214" r="6" fill="#3B82F6" />
      <circle cx="38" cy="216" r="6" fill="#40CE80" />
      <circle cx="4" cy="244" r="6" fill="#F5A012" />
    </g>
  );
}

/** FilmStrip for a Mini Me skin. */
export function FilmStrip() {
  return (
    <g transform="rotate(-15 20 240)">
      <rect x="-12" y="228" width="60" height="28" rx="3" fill="#1A1A2E" />
      <rect
        x="-6"
        y="235"
        width="13"
        height="14"
        fill="#FFFFFF"
        opacity="0.85"
      />
      <rect
        x="11"
        y="235"
        width="13"
        height="14"
        fill="#FFFFFF"
        opacity="0.85"
      />
      <rect
        x="28"
        y="235"
        width="13"
        height="14"
        fill="#FFFFFF"
        opacity="0.85"
      />
    </g>
  );
}

/** Gear for a Mini Me skin. */
export function Gear({ hub }: { hub: string }) {
  return (
    <g transform="translate(10 232)">
      {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => (
        <rect
          key={angle}
          x="-6"
          y="-32"
          width="12"
          height="14"
          rx="2"
          fill="#C9D3DD"
          transform={`rotate(${angle})`}
        />
      ))}
      <circle r="22" fill="#C9D3DD" {...OUTLINE} />
      <circle r="9" fill={hub} />
    </g>
  );
}
