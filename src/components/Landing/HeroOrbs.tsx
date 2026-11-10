import {
  Mail,
  Search,
  Sparkles,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { CarmenOrb } from "@/components/carmen/CarmenOrb";
import { marbleRef, ORBIT, useMarbleOrbit } from "./useMarbleOrbit";

interface Channel {
  label: string;
  icon: LucideIcon;
  /** HSL channels for the sphere's inner glow and icon. */
  tint: string;
}

// Fixed channel colors tell the channels apart and are decorative, so they
// do not follow the tenant brand (the center sphere does).
const CHANNELS: Array<Channel> = [
  { label: "SEO", icon: Search, tint: "217 91% 60%" },
  { label: "GEO", icon: Sparkles, tint: "262 83% 66%" },
  { label: "Automation", icon: Workflow, tint: "38 92% 55%" },
  { label: "Email Marketing", icon: Mail, tint: "350 89% 64%" },
];

const START_ANGLES = [20, 110, 200, 290];

/**
 * Five milky glass spheres on a floor: all marketing in the center, with the
 * four channel spheres rolling around it like marbles.
 */
export function HeroOrbs() {
  const nodes = useMarbleOrbit(START_ANGLES);

  return (
    <div
      aria-hidden="true"
      className="relative mx-auto aspect-[1/0.9] w-full max-w-md"
    >
      <Floor />
      <div
        className="absolute z-20 w-[36%] -translate-x-1/2"
        style={{
          left: `${ORBIT.centerX}%`,
          bottom: `${100 - ORBIT.centerY - 2}%`,
        }}
      >
        <CarmenOrb className="aspect-square h-auto w-full">
          <span className="relative z-10 text-center text-xs font-extrabold leading-tight md:text-sm">
            כל השיווק
            <br />
            במקום אחד
          </span>
        </CarmenOrb>
      </div>
      {CHANNELS.map((channel, index) => {
        const Icon = channel.icon;
        return (
          <div key={channel.label}>
            <div
              ref={marbleRef(nodes, index, "shadow")}
              className="absolute z-[5] h-[9%] w-[13%] rounded-full blur-md"
              style={{ background: `hsl(${channel.tint} / 0.35)` }}
            />
            <div
              ref={marbleRef(nodes, index, "marble")}
              className="absolute flex w-[15%] origin-bottom flex-col items-center gap-1.5"
            >
              <span
                dir="ltr"
                className="whitespace-nowrap rounded-full border bg-card/85 px-2 py-0.5 text-[10px] font-semibold shadow-elevation-1 md:text-[11px]"
              >
                {channel.label}
              </span>
              <CarmenOrb
                tint={channel.tint}
                className="aspect-square h-auto w-full"
              >
                <div
                  ref={marbleRef(nodes, index, "icon")}
                  className="relative z-10 h-[38%] w-[38%]"
                >
                  <Icon
                    className="h-full w-full"
                    style={{ color: `hsl(${channel.tint})` }}
                    strokeWidth={2.2}
                  />
                </div>
              </CarmenOrb>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Milky elliptical surface with the orbit track and the center glow. */
function Floor() {
  return (
    <>
      <div
        className="absolute h-[62%] w-full -translate-x-1/2 -translate-y-1/2 rounded-[50%] border border-white/70 bg-[radial-gradient(ellipse_at_50%_40%,hsl(var(--surface-elevated))_0%,hsl(var(--surface-inset))_65%,hsl(var(--border))_100%)] shadow-elevation-2"
        style={{ left: `${ORBIT.centerX}%`, top: `${ORBIT.centerY}%` }}
      />
      <div
        className="absolute rounded-[50%] border border-dashed border-foreground/10"
        style={{
          left: `${ORBIT.centerX - ORBIT.radiusX}%`,
          top: `${ORBIT.centerY - ORBIT.radiusY}%`,
          width: `${ORBIT.radiusX * 2}%`,
          height: `${ORBIT.radiusY * 2}%`,
        }}
      />
      <div
        className="absolute h-[18%] w-[34%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/25 blur-xl"
        style={{ left: `${ORBIT.centerX}%`, top: `${ORBIT.centerY}%` }}
      />
    </>
  );
}
