import { cn } from "@/lib/utils";

interface CarmenOrbProps {
  className?: string;
  /** Accessible name; omit when the orb sits next to a visible label. */
  label?: string;
}

/**
 * Carmen's mark: a frosted-glass sphere lit by the tenant's accent color.
 * Drawn in CSS (`.carmen-orb` in index.css) so a white-label tenant gets its
 * own Carmen from its brand colors, with no image assets.
 */
export function CarmenOrb({ className, label }: CarmenOrbProps) {
  return (
    <span
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn("carmen-orb inline-block h-8 w-8 shrink-0", className)}
    />
  );
}
