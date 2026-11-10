import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

// Extrusion shades: ink under the dark letters, a deep accent under the mint
// ones (HSL channels from the theme).
const INK_EXTRUDE = { "--extrude": "var(--brand-ink)" } as CSSProperties;
const MINT_EXTRUDE = {
  "--extrude": "var(--brand-accent-800)",
} as CSSProperties;

interface AiosLogoProps {
  /** Show "Marketing AI Operating System" under the letters. */
  tagline?: boolean;
  /** Size and spacing classes for the letters. */
  className?: string;
}

/** The "AiOs" logo, optionally with its tagline. */
export function AiosLogo({ tagline = false, className }: AiosLogoProps) {
  return (
    <span
      dir="ltr"
      role="img"
      aria-label={tagline ? "AiOs Marketing AI Operating System" : "AiOs"}
      className="inline-flex flex-col items-center leading-none"
    >
      <span
        className={cn(
          "logo-3d font-extrabold tracking-tight text-foreground",
          className,
        )}
      >
        <span style={INK_EXTRUDE}>Ai</span>
        <span className="text-brand-mint" style={MINT_EXTRUDE}>
          Os
        </span>
      </span>
      {tagline && (
        <span className="mt-3 whitespace-nowrap font-[Outfit,Heebo,sans-serif] text-lg font-semibold text-foreground md:text-xl">
          Marketing AI Operating System
        </span>
      )}
    </span>
  );
}
