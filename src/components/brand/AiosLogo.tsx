import type { CSSProperties } from "react";
import { CarmenOrb } from "@/components/carmen/CarmenOrb";
import { cn } from "@/lib/utils";

// Extrusion shades: ink under the dark letters, a deep accent under the mint
// ones (HSL channels from the theme).
const INK_EXTRUDE = { "--extrude": "var(--brand-ink)" } as CSSProperties;
const MINT_EXTRUDE = {
  "--extrude": "var(--brand-accent-800)",
} as CSSProperties;

interface AiosLogoProps {
  /** Show "Marketing" and "AI Operating System" under the letters. */
  tagline?: boolean;
  /** Lead with the glass orb, as in the brand book lockup. */
  orb?: boolean;
  /** Size and spacing classes for the letters. */
  className?: string;
}

/** The "AiOs" logo, optionally with the orb and the tagline. */
export function AiosLogo({
  tagline = false,
  orb = false,
  className,
}: AiosLogoProps) {
  return (
    <span
      dir="ltr"
      role="img"
      aria-label={tagline ? "AiOs Marketing AI Operating System" : "AiOs"}
      className="inline-flex flex-col items-center leading-none"
    >
      <span
        className={cn(
          "logo-3d inline-flex items-center font-extrabold tracking-tight text-foreground",
          className,
        )}
      >
        {orb && (
          <span data-orb-home="" className="me-[0.25em] inline-flex">
            <CarmenOrb className="h-[1.05em] w-[1.05em]" />
          </span>
        )}
        <span style={INK_EXTRUDE}>Ai</span>
        <span className="text-brand-mint" style={MINT_EXTRUDE}>
          Os
        </span>
      </span>
      {tagline && (
        <span className="mt-3 flex flex-col items-center whitespace-nowrap font-[Outfit,Heebo,sans-serif] text-foreground">
          <span className="text-2xl font-semibold md:text-3xl">Marketing</span>
          <span className="mt-1.5 text-sm font-medium tracking-[0.06em] md:text-base">
            AI Operating System
          </span>
        </span>
      )}
    </span>
  );
}
