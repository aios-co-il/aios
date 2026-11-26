import { useContext } from "react";
import { cn } from "@/lib/utils";
import type { OrbBuddyState } from "../CarmenOrbBuddy";
import { getCarmenRole } from "../../../../supabase/functions/_shared/carmen/skin-roles";
import { type MiniMeGender, MiniMeGenderContext } from "./miniMeGender";
import { miniMeImage } from "./miniMeImages";
import "./mini-me.css";

interface MiniMeProps {
  /** Skin (role) slug: picks which Mini Me render is shown. */
  skin?: string | null;
  /** Speaking pulses, listening tilts, working sways. */
  state?: OrbBuddyState;
  /** The male or female set; defaults to the signed-in user's choice. */
  gender?: MiniMeGender;
  /** Accessible name; without one the figure is decorative. */
  label?: string;
  /** Size classes; the figure stays a circle (width sets the size). */
  className?: string;
}

/**
 * Carmen's default look, the Mini Me: a pearly glass character in a frosted
 * disc. Each skin has its own render, with its own pose and prop, in a male
 * and a female set.
 */
export function MiniMe({
  skin,
  state = "idle",
  gender,
  label,
  className,
}: MiniMeProps) {
  const userGender = useContext(MiniMeGenderContext);
  const set = gender ?? userGender;
  const role = getCarmenRole(skin);

  return (
    <span
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      data-state={state}
      data-gender={set}
      className={cn("mini-me", className)}
    >
      <img
        className="mini-me-figure"
        src={miniMeImage(role?.slug, set)}
        alt=""
        draggable={false}
      />
    </span>
  );
}
