import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

// Extrusion shades: ink under the dark letters, a deep accent under the mint
// ones (HSL channels from the theme).
const INK_EXTRUDE = { "--extrude": "var(--brand-ink)" } as CSSProperties;
const MINT_EXTRUDE = {
  "--extrude": "var(--brand-accent-800)",
} as CSSProperties;

/** "AiOs" with "Marketing AI Operating System" under it. */
export function AiosLogo({ className }: { className?: string }) {
  return (
    <div
      dir="ltr"
      role="img"
      aria-label="AiOs Marketing AI Operating System"
      className={cn("flex flex-col items-center leading-none", className)}
    >
      <span className="logo-3d text-7xl font-extrabold tracking-tight text-foreground md:text-8xl">
        <span style={INK_EXTRUDE}>Ai</span>
        <span className="text-brand-mint" style={MINT_EXTRUDE}>
          Os
        </span>
      </span>
      <span className="mt-3 font-[Outfit,Heebo,sans-serif] text-lg font-semibold text-foreground md:text-xl">
        Marketing AI Operating System
      </span>
    </div>
  );
}
