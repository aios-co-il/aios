import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

interface CarmenOrbProps {
  className?: string;
  /** Accessible name; omit when the orb sits next to a visible label. */
  label?: string;
  /** HSL channels (`217 91% 60%`) to tint the glass; defaults to the accent. */
  tint?: string;
  /** Content shown inside the sphere, such as an icon. */
  children?: ReactNode;
}

/**
 * Carmen's mark: a glass sphere lit by the tenant's accent color.
 * Drawn in CSS (`.carmen-orb` in index.css) so a white-label tenant gets its
 * own Carmen from its brand colors, with no image assets.
 */
export function CarmenOrb({
  className,
  label,
  tint,
  children,
}: CarmenOrbProps) {
  const style = tint ? ({ "--orb-tint": tint } as CSSProperties) : undefined;
  return (
    <span
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      style={style}
      className={cn("carmen-orb h-8 w-8 shrink-0", className)}
    >
      {children}
    </span>
  );
}
