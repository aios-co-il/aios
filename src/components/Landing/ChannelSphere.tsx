import type { ReactNode } from "react";
import { Mail, MousePointerClick, Sparkles, Users } from "lucide-react";
import { CarmenOrb } from "@/components/carmen/CarmenOrb";
import { cn } from "@/lib/utils";
import { FacebookMark, GoogleMark } from "./brandMarks";

export interface SphereSpec {
  id: string;
  label: string;
  /** HSL channels for the glass glow; omit to follow the tenant accent. */
  tint?: string;
  content: ReactNode;
}

const ICON = "relative h-[36%] w-[36%]";

// Channel colors are fixed and decorative; the AIOS sphere follows the brand.
export const SPHERES: Array<SphereSpec> = [
  { id: "aios", label: "AIOS Marketing", content: <AiosEmboss /> },
  {
    id: "ppc",
    label: "PPC",
    tint: "38 92% 55%",
    content: (
      <MousePointerClick
        className={ICON}
        style={{ color: "hsl(32 90% 48%)" }}
      />
    ),
  },
  {
    id: "geo",
    label: "GEO",
    tint: "262 83% 66%",
    content: (
      <Sparkles className={ICON} style={{ color: "hsl(262 70% 58%)" }} />
    ),
  },
  {
    id: "email",
    label: "Email Marketing",
    tint: "350 89% 64%",
    content: <Mail className={ICON} style={{ color: "hsl(350 75% 55%)" }} />,
  },
  {
    id: "google",
    label: "Google",
    tint: "217 91% 60%",
    content: <GoogleMark className={ICON} />,
  },
  {
    id: "facebook",
    label: "Facebook",
    tint: "221 83% 53%",
    content: <FacebookMark className={ICON} />,
  },
  {
    id: "crm",
    label: "CRM",
    tint: "186 80% 42%",
    content: <Users className={ICON} style={{ color: "hsl(186 75% 36%)" }} />,
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
  return (
    <figure className={cn("flex flex-col items-center gap-3", className)}>
      <CarmenOrb
        tint={spec.tint}
        className="aspect-square h-auto w-full [container-type:inline-size]"
      >
        {spec.content}
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

/**
 * The AIOS wordmark set inside the glass: a soft glow behind it, accent
 * gradient letters, and the sphere's rim light passing over them.
 */
function AiosEmboss() {
  return (
    <span
      dir="ltr"
      className="relative flex flex-col items-center text-[11cqw]"
    >
      <span className="absolute inset-[-10%] rounded-full bg-primary/15 blur-xl" />
      <span className="aios-emboss relative text-[1.9em] font-extrabold leading-none tracking-tight">
        AIOS
      </span>
      <span className="relative mt-1 text-[0.62em] font-bold uppercase tracking-[0.32em] text-foreground/60">
        Marketing
      </span>
      <span className="relative mt-0.5 text-[0.42em] font-medium tracking-[0.12em] text-foreground/45">
        AI Operating System
      </span>
    </span>
  );
}
