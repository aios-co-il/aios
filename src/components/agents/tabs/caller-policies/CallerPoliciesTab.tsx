import { Skeleton } from "@/components/ui/skeleton";
import {
  CALLER_KINDS,
  callerPolicyFor,
} from "../../../../../supabase/functions/_shared/carmen/caller-policy/policy.ts";
import { CallerPolicyCard } from "./CallerPolicyCard";
import { useCallerPolicies } from "./useCallerPolicies";

/**
 * What Carmen may say to callers outside the team, per org: a known client and an unknown
 * caller. Her phone line follows it (AIO-511).
 */
export function CallerPoliciesTab({ tenantId }: { tenantId: string | null }) {
  const policies = useCallerPolicies(tenantId);
  if (!tenantId || policies.isLoading) {
    return <Skeleton className="h-64 w-full" />;
  }
  if (policies.error) {
    return (
      <p className="text-sm text-destructive" dir="rtl">
        לא הצלחתי לטעון את ההנחיות: {policies.error.message}
      </p>
    );
  }
  const rows = policies.data ?? [];
  return (
    <div className="space-y-4" dir="rtl">
      <p className="text-sm text-muted-foreground">
        כך כרמן מדברת עם מי שאינו בצוות, בטלפון ובהמשך גם בערוצים נוספים. מה שלא
        שונה כאן משתמש בברירת המחדל.
      </p>
      {CALLER_KINDS.map((kind) => (
        <CallerPolicyCard
          key={kind}
          tenantId={tenantId}
          kind={kind}
          policy={callerPolicyFor(kind, rows)}
        />
      ))}
    </div>
  );
}
