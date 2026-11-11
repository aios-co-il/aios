import type { ReactNode } from "react";
import { CarmenOrb } from "@/components/carmen/CarmenOrb";

/** Carmen's one-line read of the report, beside her orb. */
export function CarmenInsight({ children }: { children: ReactNode }) {
  return (
    <aside className="flex items-center gap-4 rounded-2xl border border-brand-accent/30 bg-gradient-to-l from-brand-accent/15 via-brand-accent/5 to-transparent p-4 shadow-elevation-1">
      <CarmenOrb className="h-11 w-11" />
      <div className="h-10 w-px bg-border" aria-hidden="true" />
      <div>
        <p className="font-bold">כרמן</p>
        <p className="text-sm text-muted-foreground">{children}</p>
      </div>
    </aside>
  );
}
