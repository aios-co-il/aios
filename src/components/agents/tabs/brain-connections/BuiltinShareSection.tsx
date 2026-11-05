import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type {
  BuiltinBrainState,
  TenantRef,
} from "../../../../../supabase/functions/_shared/carmen/brain-connections/types.ts";
import type { useBrainConnections } from "./useBrainConnections";

/**
 * Shares this tenant's keys for one built-in brain with other organizations
 * (any of them for a super admin acting in a home tenant, else the ones the
 * user belongs to), like a shared Facebook connection (AIO-303, AIO-354).
 */
export function BuiltinShareSection({
  builtin,
  shareTargets,
  write,
}: {
  builtin: BuiltinBrainState;
  shareTargets: TenantRef[];
  write: ReturnType<typeof useBrainConnections>["write"];
}) {
  const sharedTo = new Set(builtin.shared_to.map((t) => t.id));
  const toggle = (target: TenantRef, share: boolean) =>
    write.mutate({
      action: share ? "share_builtin" : "unshare_builtin",
      payload: { builtin_slug: builtin.slug, target_tenant_id: target.id },
      success: share
        ? `${builtin.label} משותף עם ${target.name}`
        : `השיתוף עם ${target.name} הופסק`,
    });

  return (
    <div className="space-y-2 border-t pt-3">
      <Label>שיתוף לארגונים</Label>
      <p className="text-xs text-muted-foreground">
        ארגון ששותף ישתמש במפתח הזה כל עוד אין לו מפתח משלו.
      </p>
      {shareTargets.map((target) => (
        <label key={target.id} className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={sharedTo.has(target.id)}
            disabled={write.isPending}
            onCheckedChange={(checked) => toggle(target, checked === true)}
          />
          {target.name}
        </label>
      ))}
    </div>
  );
}
