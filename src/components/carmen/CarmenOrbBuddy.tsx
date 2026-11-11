import type { CSSProperties } from "react";
import { CarmenOrb } from "@/components/carmen/CarmenOrb";
import type { CarmenFaceState } from "@/components/carmen-command/CarmenFace";
import "./orb-buddy.css";

/** Her face states, plus working: eyes glance aside and the hands tap. */
export type OrbBuddyState = CarmenFaceState | "working";

interface CarmenOrbBuddyProps {
  /** HSL channels for the glass; defaults to the tenant accent. */
  tint?: string;
  /** Speaking opens the mouth and moves the hands, listening softens the eyes. */
  state?: OrbBuddyState;
  /** Accessible name. */
  label?: string;
  /** Size classes; the figure keeps its own proportions. */
  className?: string;
}

/**
 * Carmen as a humanised orb: the glass sphere with a subtle face and
 * floating hands and feet, all in the sphere's tint.
 */
export function CarmenOrbBuddy({
  tint,
  state = "idle",
  label,
  className,
}: CarmenOrbBuddyProps) {
  const style = tint ? ({ "--orb-tint": tint } as CSSProperties) : undefined;
  return (
    <div
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      data-state={state}
      style={style}
      className={`orb-buddy ${className ?? ""}`}
    >
      <span className="orb-buddy-shadow" />
      <span className="orb-buddy-limb orb-buddy-foot is-start" />
      <span className="orb-buddy-limb orb-buddy-foot is-end" />
      <CarmenOrb tint={tint} className="orb-buddy-body">
        <OrbFace />
      </CarmenOrb>
      <span className="orb-buddy-limb orb-buddy-hand is-start" />
      <span className="orb-buddy-limb orb-buddy-hand is-end" />
    </div>
  );
}

/** Eyes and mouth in a 100×100 box over the sphere; CSS picks the variant per state. */
function OrbFace() {
  return (
    <svg className="orb-buddy-face" viewBox="0 0 100 100">
      <g className="orb-buddy-eyes is-open">
        <ellipse cx="40" cy="51" rx="3.2" ry="5" />
        <ellipse cx="60" cy="51" rx="3.2" ry="5" />
      </g>
      <g className="orb-buddy-eyes is-soft">
        <path d="M35 51 q5 5 10 0" />
        <path d="M55 51 q5 5 10 0" />
      </g>
      <path className="orb-buddy-mouth is-smile" d="M47.5 63.5 q2.5 2 5 0" />
      <path className="orb-buddy-mouth is-open" d="M45.5 62 q4.5 7 9 0 z" />
    </svg>
  );
}
