import { useId } from "react";
import { cn } from "@/lib/utils";
import type { OrbBuddyState } from "../CarmenOrbBuddy";
import { getCarmenRole } from "../../../../supabase/functions/_shared/carmen/skin-roles";
import { miniMePalette } from "./miniMePalette";
import { MINI_ME_PROPS } from "./miniMeProps";
import { PinkyHand } from "./MiniMePinkyHand";
import "./mini-me.css";

const BODY =
  "M140 46 C206 46 244 104 242 168 C240 232 196 270 140 270 C84 270 38 232 38 166 C38 102 76 46 140 46 Z";

interface MiniMeProps {
  /** Skin (role) slug: picks the color and what the Mini Me holds or wears. */
  skin?: string | null;
  /** HSL channels overriding the skin's color; none follows the brand. */
  tint?: string;
  /** Speaking moves the mouth, listening tilts, working glances aside. */
  state?: OrbBuddyState;
  /** Accessible name; without one the figure is decorative. */
  label?: string;
  /** Size classes; the figure keeps its proportions (width sets the size). */
  className?: string;
}

/**
 * Carmen's default look, the Mini Me: a glass body that is not quite round,
 * big eyes, and a pinky at the corner of the mouth. Each skin tints the
 * glass and adds its prop.
 */
export function MiniMe({
  skin,
  tint,
  state = "idle",
  label,
  className,
}: MiniMeProps) {
  const id = useId().replace(/:/g, "");
  const role = getCarmenRole(skin);
  const palette = miniMePalette(tint ?? role?.orbTint);
  const props = role ? MINI_ME_PROPS[role.slug] : undefined;
  const glass = `mm-glass-${id}`;
  const glow = `mm-glow-${id}`;
  const shadow = `mm-shadow-${id}`;
  return (
    <svg
      viewBox="-24 -20 328 340"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      data-state={state}
      className={cn("mini-me", className)}
    >
      <defs>
        <radialGradient id={glass} cx="36%" cy="28%" r="80%">
          <stop offset="0%" stopColor={palette.light} stopOpacity="0.9" />
          <stop offset="50%" stopColor={palette.mid} stopOpacity="0.55" />
          <stop offset="100%" stopColor={palette.dark} stopOpacity="0.85" />
        </radialGradient>
        <radialGradient id={glow} cx="50%" cy="90%" r="48%">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
        </radialGradient>
        <filter id={shadow} x="-40%" y="-40%" width="180%" height="180%">
          <feDropShadow
            dx="-2"
            dy="5"
            stdDeviation="4"
            floodColor="#0A1526"
            floodOpacity="0.45"
          />
        </filter>
      </defs>
      <ellipse
        className="mini-me-ground"
        cx="140"
        cy="302"
        rx="80"
        ry="10"
        fill="#0A1526"
        opacity="0.14"
      />
      <g className="mini-me-figure">
        <ellipse cx="108" cy="276" rx="26" ry="12" fill={palette.dark} />
        <ellipse cx="172" cy="276" rx="26" ry="12" fill={palette.dark} />
        <path
          d="M44 178 Q30 205 38 228"
          stroke={palette.limb}
          strokeWidth="18"
          strokeLinecap="round"
          fill="none"
        />
        <path d={BODY} fill={`url(#${glass})`} />
        <path d={BODY} fill={`url(#${glow})`} />
        <path
          d={BODY}
          fill="none"
          stroke="#FFFFFF"
          strokeOpacity="0.7"
          strokeWidth="2.5"
        />
        <ellipse
          cx="100"
          cy="86"
          rx="36"
          ry="17"
          fill="#FFFFFF"
          opacity="0.7"
          transform="rotate(-24 100 86)"
        />
        <circle cx="78" cy="118" r="5" fill="#FFFFFF" opacity="0.85" />
        <g className="mini-me-eyes">
          <circle cx="106" cy="140" r="31" fill="#FFFFFF" />
          <circle cx="176" cy="140" r="31" fill="#FFFFFF" />
          <g className="mini-me-pupils">
            <circle cx="111" cy="144" r="17" fill="#0A1526" />
            <circle cx="181" cy="144" r="17" fill="#0A1526" />
            <circle cx="117" cy="137" r="6" fill="#FFFFFF" />
            <circle cx="187" cy="137" r="6" fill="#FFFFFF" />
          </g>
        </g>
        <path
          className="mini-me-mouth"
          d="M116 206 Q142 220 163 201"
          stroke="#0A1526"
          strokeWidth="6"
          strokeLinecap="round"
          fill="none"
        />
        {props?.head?.(palette)}
        {props?.hand?.(palette)}
        <circle cx="38" cy="232" r="15" fill={palette.limb} />
        <PinkyHand limb={palette.limb} shadow={shadow} />
      </g>
    </svg>
  );
}
