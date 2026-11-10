import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

// Extrusion shades: a deeper ink under the dark letters, a deeper accent under
// the green ones (HSL channels from the theme).
const INK_EXTRUDE = { "--extrude": "var(--brand-accent-950)" } as CSSProperties;
const ACCENT_EXTRUDE = {
  "--extrude": "var(--brand-accent-700)",
} as CSSProperties;

/** "AiOs" with "Marketing OS" under it, in the product wordmark style. */
export function AiosLogo({ className }: { className?: string }) {
  return (
    <div
      dir="ltr"
      role="img"
      aria-label="AiOs Marketing OS"
      className={cn("flex flex-col items-center leading-none", className)}
    >
      <span className="logo-3d text-7xl font-black tracking-tight md:text-8xl">
        <span style={INK_EXTRUDE}>Ai</span>
        <span className="text-primary" style={ACCENT_EXTRUDE}>
          Os
        </span>
      </span>
      <span className="logo-3d mt-3 text-xl font-extrabold tracking-tight md:text-2xl">
        <span style={INK_EXTRUDE}>Marketing</span>
        <span className="ms-1.5 text-primary" style={ACCENT_EXTRUDE}>
          OS
        </span>
      </span>
    </div>
  );
}
