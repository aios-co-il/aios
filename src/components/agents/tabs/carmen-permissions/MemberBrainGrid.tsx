import { LevelSelect } from "./LevelSelect";
import {
  NONE,
  canBugfix,
  levelFor,
  nextBrainAccess,
  type AccessPatch,
  type AccessRow,
  type DevTier,
  type Route,
} from "./types";

/** Per-brain levels plus the dev-task tier for one restricted member. */
export function MemberBrainGrid({
  row,
  routes,
  disabled,
  onPatch,
}: {
  row: AccessRow;
  routes: Route[];
  disabled: boolean;
  onPatch: (patch: AccessPatch) => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {routes.map((r) => (
        <div
          key={r.id}
          className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5"
        >
          <span className="truncate text-xs">{r.label}</span>
          <LevelSelect
            value={levelFor(row, r.slug) ?? NONE}
            disabled={disabled}
            allowBugfix={canBugfix(r)}
            onChange={(v) =>
              onPatch({ brain_access: nextBrainAccess(row, routes, r.slug, v) })
            }
          />
        </div>
      ))}
      <div className="flex items-center justify-between gap-2 rounded-md border border-dashed px-2 py-1.5 sm:col-span-2">
        <span className="text-xs">משימות פיתוח שכרמן שולחת בשמו</span>
        <LevelSelect
          value={row.dev_escalation_tier ?? NONE}
          disabled={disabled}
          allowBugfix
          bugfixFirst
          onChange={(v) =>
            onPatch({ dev_escalation_tier: v === NONE ? null : (v as DevTier) })
          }
        />
      </div>
    </div>
  );
}
