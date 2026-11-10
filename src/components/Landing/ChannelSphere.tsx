import type { CSSProperties, ReactNode } from "react";
import { Mail, Users } from "lucide-react";
import { CarmenOrb } from "@/components/carmen/CarmenOrb";
import { cn } from "@/lib/utils";
import { AiosLogo } from "./AiosLogo";
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

/** The brand sphere: follows the tenant accent. */
export const AIOS_SPHERE: SphereSpec = {
  id: "aios",
  label: "AIOS Marketing",
  core: <AiosWordmark />,
};

// Channel colors are fixed and decorative.
export const CHANNEL_SPHERES: Array<SphereSpec> = [
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
        <span className="sphere-veil" />
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

/** The AiOs logo and "AI Operating System" set inside the brand sphere. */
function AiosWordmark() {
  return (
    <span className="flex flex-col items-center">
      <AiosLogo className="text-[2.4em]" />
      <span className="mt-1.5 whitespace-nowrap text-[0.48em] font-semibold tracking-[0.08em] text-foreground/70">
        AI Operating System
      </span>
    </span>
  );
}
