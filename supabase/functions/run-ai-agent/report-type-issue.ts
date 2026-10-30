/**
 * Whether a Meta report's type fits what Meta spends on (AIO-238), for
 * verify_report_vs_meta.
 */
import { round2 } from "../_shared/reconcile/metrics.ts";
import { objectiveKind } from "../_shared/report-meta-verify.mjs";

/**
 * A leads-only report hides sales campaigns; an ecommerce report that is
 * mostly leads is mislabeled. Returns that issue (Hebrew, for Carmen's
 * answer, or null) and Meta's spend split by campaign objective.
 */
export function reportTypeIssue(
  metaRows: Array<{ objective?: unknown; spend: number }> = [],
  reportType = "mixed",
): {
  typeIssue: string | null;
  metaSpend: number;
  spendByObjective: { ecommerce: number; leads: number; other: number };
} {
  const spendByKind = { ecommerce: 0, leads: 0, other: 0 };
  let metaSpend = 0;
  for (const m of metaRows) {
    const value = Number(m.spend) || 0;
    metaSpend += value;
    spendByKind[objectiveKind(m.objective)] += value;
  }
  let typeIssue: string | null = null;
  if (reportType === "leads" && spendByKind.ecommerce >= 5) {
    typeIssue = `הדוח מוגדר לידים בלבד אבל יש קמפייני מכירה במטא (₪${round2(spendByKind.ecommerce)})`;
  } else if (
    reportType === "ecommerce" &&
    spendByKind.leads > metaSpend * 0.5
  ) {
    typeIssue = `הדוח מוגדר איקומרס אבל רוב ההוצאה במטא על קמפייני לידים (₪${round2(spendByKind.leads)})`;
  }
  return {
    typeIssue,
    metaSpend: round2(metaSpend),
    spendByObjective: {
      ecommerce: round2(spendByKind.ecommerce),
      leads: round2(spendByKind.leads),
      other: round2(spendByKind.other),
    },
  };
}
