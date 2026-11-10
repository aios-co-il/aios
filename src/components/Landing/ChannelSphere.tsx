import type { CSSProperties, ReactNode } from "react";
import { Mail, Users } from "lucide-react";
import { CarmenOrb } from "@/components/carmen/CarmenOrb";
import { cn } from "@/lib/utils";
import { FacebookMark, GoogleMark } from "./brandMarks";

export interface SphereSpec {
  id: string;
  label: string;
  /** HSL channels for the glass glow; omit to follow the tenant accent. */
  tint?: string;
  /** HSL channels for the core (text or icon), a dark shade of the tint. */
  ink?: string;
  core: ReactNode;
}

const ICON = "h-[36%] w-[36%]";
const WORD = "text-[2.2em] font-extrabold leading-none tracking-tight";

// Channel colors are fixed and decorative; the AIOS sphere follows the brand.
export const SPHERES: Array<SphereSpec> = [
  { id: "aios", label: "AIOS Marketing", core: <AiosWordmark /> },
  {
    id: "seo",
    label: "SEO",
    tint: "199 89% 52%",
    ink: "201 90% 27%",
    core: <span className={WORD}>SEO</span>,
  },
  {
    id: "geo",
    label: "GEO",
    tint: "262 83% 66%",
    ink: "263 60% 32%",
    core: <span className={WORD}>GEO</span>,
  },
  {
    id: "ppc",
    label: "PPC",
    tint: "38 92% 55%",
    ink: "28 85% 30%",
    core: <span className={WORD}>PPC</span>,
  },
  {
    id: "email",
    label: "Email Marketing",
    tint: "330 81% 62%",
    ink: "331 65% 32%",
    core: <Mail className={ICON} strokeWidth={2.4} />,
  },
  {
    id: "google",
    label: "Google",
    tint: "4 86% 60%",
    ink: "4 70% 32%",
    core: <GoogleMark className={ICON} />,
  },
  {
    id: "facebook",
    label: "Facebook",
    tint: "221 83% 58%",
    ink: "224 70% 30%",
    core: <FacebookMark className={ICON} />,
  },
  {
    id: "crm",
    label: "CRM",
    tint: "172 66% 45%",
    ink: "174 70% 22%",
    core: <Users className={ICON} strokeWidth={2.4} />,
  },
];

/** One glass sphere from the set, with an optional label under it. */
export function ChannelSphere({
  spec,
  showLabel = true,
  className,
}: {
  spec: SphereSpec;
  showLabel?: boolean;
  className?: string;
}) {
  const coreStyle = spec.ink
    ? ({ "--core-ink": spec.ink } as CSSProperties)
    : undefined;
  return (
    <figure className={cn("flex flex-col items-center gap-3", className)}>
      <CarmenOrb
        tint={spec.tint}
        className="aspect-square h-auto w-full [container-type:inline-size]"
      >
        <span
          dir="ltr"
          style={coreStyle}
          className="sphere-core flex h-full w-full items-center justify-center text-[11cqw]"
        >
          {spec.core}
        </span>
      </CarmenOrb>
      {showLabel && (
        <figcaption
          dir="ltr"
          className="whitespace-nowrap rounded-full border bg-card/85 px-2.5 py-0.5 text-xs font-semibold shadow-elevation-1"
        >
          {spec.label}
        </figcaption>
      )}
    </figure>
  );
}

/** "AIOS / Marketing / AI Operating System" set inside the brand sphere. */
function AiosWordmark() {
  return (
    <span className="flex flex-col items-center">
      <span className="text-[1.9em] font-extrabold leading-none tracking-tight">
        AIOS
      </span>
      <span className="mt-1 text-[0.62em] font-bold uppercase tracking-[0.32em] opacity-75">
        Marketing
      </span>
      <span className="mt-0.5 text-[0.42em] font-medium tracking-[0.12em] opacity-60">
        AI Operating System
      </span>
    </span>
  );
}
