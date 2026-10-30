import { ChevronDown } from "lucide-react";
import type { BrainRoute, BrainRouteType } from "@/lib/agentChannelRouting";
import {
  FALLBACK_BRAIN_ROUTES,
  billingNoteForRoute,
  groupLabel,
} from "@/lib/agentChannelRouting";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { RouteIcon, routeColor } from "./BrainRouteIcon";
import { BrainRouteNote } from "./BrainRouteNote";
import { statusLabel } from "./brainRouteStatus";

interface BrainRouteSelectorProps {
  routes: BrainRoute[];
  value: string | null;
  onChange: (route: BrainRoute) => void;
  disabled?: boolean;
  status?: string | null;
  externalUrl?: string | null;
  className?: string;
  /** One-line trigger without the note underneath; the note moves to the tooltip. */
  compact?: boolean;
}

export function BrainRouteSelector({
  routes,
  value,
  onChange,
  disabled,
  status,
  externalUrl,
  className = "",
  compact = false,
}: BrainRouteSelectorProps) {
  const list = routes.length ? routes : FALLBACK_BRAIN_ROUTES;
  const current =
    list.find((r) => r.id === value || r.slug === value) || list[0];
  const grouped = list.reduce<Record<string, BrainRoute[]>>((acc, r) => {
    (acc[r.route_type] ||= []).push(r);
    return acc;
  }, {});
  const groups = Object.keys(grouped) as BrainRouteType[];

  return (
    <div
      className={`flex min-w-0 ${compact ? "" : "max-w-[16rem]"} flex-col gap-0.5 ${className}`}
      dir="rtl"
    >
      <DropdownMenu dir="rtl">
        <DropdownMenuTrigger asChild disabled={disabled}>
          <button
            type="button"
            title={
              compact
                ? [
                    "בורר מוח — משנה את נתיב השליחה",
                    billingNoteForRoute(current?.provider),
                    statusLabel(status),
                  ]
                    .filter(Boolean)
                    .join(" · ")
                : "בורר מוח — משנה את נתיב השליחה"
            }
            className={`flex ${compact ? "h-9 min-w-0" : "h-11 min-w-[11rem]"} w-full items-center gap-1.5 rounded-lg border border-[var(--cc-line)] bg-[rgba(5,10,22,0.6)] px-2 text-xs text-[var(--cc-text)] outline-none hover:border-[var(--cc-line-strong)] disabled:opacity-50`}
          >
            <RouteIcon
              type={current?.route_type || "internal"}
              color={routeColor(current)}
            />
            <span className="min-w-0 flex-1 truncate text-right">
              {current?.label}
            </span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[var(--cc-text-dim)]" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          side={compact ? "top" : "bottom"}
          collisionPadding={8}
          className="cc-root cc-menu z-[90] min-w-[16rem] border-[var(--cc-line)] bg-[rgba(8,16,34,0.98)] text-[var(--cc-text)]"
        >
          {groups.map((type, i) => (
            <div key={type}>
              {i > 0 && (
                <DropdownMenuSeparator className="bg-[var(--cc-line)]" />
              )}
              <DropdownMenuLabel className="text-[10px] text-[var(--cc-text-dim)]">
                {groupLabel(type)}
              </DropdownMenuLabel>
              {grouped[type].map((r) => (
                <DropdownMenuItem
                  key={r.id}
                  className="cursor-pointer gap-2 text-right"
                  onSelect={() => onChange(r)}
                >
                  <RouteIcon type={r.route_type} color={routeColor(r)} />
                  <span className="flex-1">{r.label}</span>
                </DropdownMenuItem>
              ))}
            </div>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {!compact && (
        <BrainRouteNote
          provider={current?.provider}
          status={status}
          externalUrl={externalUrl}
        />
      )}
    </div>
  );
}
