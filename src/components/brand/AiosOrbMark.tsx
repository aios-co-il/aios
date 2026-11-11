import { CarmenOrb } from "@/components/carmen/CarmenOrb";
import { cn } from "@/lib/utils";

interface AiosOrbMarkProps {
  /** Size classes for the sphere; the letters scale with `text-*`. */
  className?: string;
}

/** The app mark: the deep green glass orb with the "AiOs" letters inside, as on the app icon. */
export function AiosOrbMark({ className }: AiosOrbMarkProps) {
  return (
    <CarmenOrb
      label="AiOs"
      className={cn("orb-deep h-9 w-9 text-[11px]", className)}
    >
      <span
        dir="ltr"
        className="relative z-10 font-extrabold leading-none tracking-tight"
      >
        <span className="text-brand-ink dark:text-white">Ai</span>
        <span className="text-white [text-shadow:0_1px_2px_hsl(var(--brand-ink)/0.45)]">
          Os
        </span>
      </span>
    </CarmenOrb>
  );
}
