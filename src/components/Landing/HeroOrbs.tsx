import {
  Mail,
  Search,
  Sparkles,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { CarmenOrb } from "@/components/carmen/CarmenOrb";

interface Channel {
  label: string;
  icon: LucideIcon;
  /** HSL channels for the sphere's glass tint. */
  tint: string;
  /** Sphere center, in % of the scene. */
  x: number;
  y: number;
  /** Float animation offset, so the spheres drift out of step. */
  delay: string;
}

// Fixed channel colors: they tell the channels apart and are decorative,
// so they do not follow the tenant brand (the center sphere does).
const CHANNELS: Array<Channel> = [
  {
    label: "SEO",
    icon: Search,
    tint: "217 91% 60%",
    x: 80,
    y: 18,
    delay: "0s",
  },
  {
    label: "GEO",
    icon: Sparkles,
    tint: "262 83% 66%",
    x: 18,
    y: 22,
    delay: "-1.5s",
  },
  {
    label: "Automation",
    icon: Workflow,
    tint: "38 92% 55%",
    x: 16,
    y: 80,
    delay: "-3s",
  },
  {
    label: "Email Marketing",
    icon: Mail,
    tint: "350 89% 64%",
    x: 82,
    y: 80,
    delay: "-4.5s",
  },
];

/** Five glass spheres: all marketing in the center, linked to four channels. */
export function HeroOrbs() {
  return (
    <div
      aria-hidden="true"
      className="relative mx-auto aspect-square w-full max-w-md"
    >
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        {CHANNELS.map((channel) => (
          <line
            key={channel.label}
            x1="50"
            y1="50"
            x2={channel.x}
            y2={channel.y}
            className="stroke-border"
            strokeWidth="0.4"
            strokeDasharray="1.2 1.2"
          />
        ))}
      </svg>
      <div className="absolute bottom-[14%] left-1/2 h-8 w-1/2 -translate-x-1/2 rounded-full bg-primary/25 blur-2xl" />
      <div className="absolute left-1/2 top-1/2 flex w-[46%] -translate-x-1/2 -translate-y-1/2 flex-col items-center">
        <CarmenOrb className="aspect-square h-auto w-full animate-carmen-breathe">
          <span className="relative z-10 text-center text-sm font-extrabold leading-tight md:text-base">
            כל השיווק
            <br />
            במקום אחד
          </span>
        </CarmenOrb>
      </div>
      {CHANNELS.map((channel) => (
        <ChannelOrb key={channel.label} channel={channel} />
      ))}
    </div>
  );
}

/** One small tinted sphere with its icon and label. */
function ChannelOrb({ channel }: { channel: Channel }) {
  const Icon = channel.icon;
  return (
    <div
      className="absolute w-[22%] -translate-x-1/2 -translate-y-1/2"
      style={{ left: `${channel.x}%`, top: `${channel.y}%` }}
    >
      {/* The float animation sets transform, so it lives on an inner box. */}
      <div
        className="relative flex animate-carmen-breathe flex-col items-center"
        style={{ animationDelay: channel.delay }}
      >
        <CarmenOrb tint={channel.tint} className="aspect-square h-auto w-full">
          <Icon
            className="relative z-10 h-1/3 w-1/3"
            style={{ color: `hsl(${channel.tint})` }}
            strokeWidth={2.2}
          />
        </CarmenOrb>
        <span
          dir="ltr"
          className="absolute top-full mt-2 whitespace-nowrap rounded-full border bg-card/80 px-2.5 py-0.5 text-[11px] font-semibold shadow-elevation-1"
        >
          {channel.label}
        </span>
      </div>
    </div>
  );
}
