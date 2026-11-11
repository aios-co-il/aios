import { CarmenOrb } from "@/components/carmen/CarmenOrb";
import { cn } from "@/lib/utils";

interface AiosOrbMarkProps {
  /** Size classes for the sphere; the letters scale with `text-*`. */
  className?: string;
}

/** The app mark: the navy glass orb with the "AiOs" letters inside, as on the app icon. */
export function AiosOrbMark({ className }: AiosOrbMarkProps) {
  return (
    <CarmenOrb
      label="AiOs"
      className={cn("orb-navy h-9 w-9 text-[10px]", className)}
    >
      <span
        dir="ltr"
        className="relative z-10 font-extrabold leading-none tracking-tight"
      >
        <span className="text-white">Ai</span>
        <span className="text-brand-mint">Os</span>
      </span>
    </CarmenOrb>
  );
}
