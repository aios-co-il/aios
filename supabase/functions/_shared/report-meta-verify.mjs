// Compare what an AIOS Facebook report holds against Meta's own numbers for the same
// campaigns and dates (campaign level only — adset/ad rows would double count).
// compareReportToMeta is the window-total comparison; Carmen's verify_report_vs_meta
// now uses the per-day reconciliation core (reconcile-core.ts) plus reportTypeIssue.

const SALES = new Set([
  "OUTCOME_SALES",
  "PRODUCT_CATALOG_SALES",
  "SALES",
  "CONVERSIONS",
]);
const LEADS = new Set(["OUTCOME_LEADS", "LEAD_GENERATION"]);

export function objectiveKind(objective) {
  const o = String(objective || "").toUpperCase();
  if (SALES.has(o)) return "ecommerce";
  if (LEADS.has(o)) return "leads";
  return "other";
}

/** Report type of a facebook table: leads-only, ecommerce, or mixed (shows both). */
export function facebookReportType(integrationType, integrationSettings = {}) {
  if (integrationType === "facebook_ecommerce") return "ecommerce";
  const cfg = String(integrationSettings?.campaign_type || "").toLowerCase();
  if (cfg === "leads" || cfg === "lead") return "leads";
  if (cfg === "ecommerce") return "ecommerce";
  return "mixed";
}

const round = (n) => Math.round(Number(n || 0) * 100) / 100;

/**
 * Does the report's type fit what Meta spends on? A leads-only report hides sales
 * campaigns; an ecommerce report that is mostly leads is mislabeled.
 * @param {Array<{objective?:string,spend:number}>} metaRows
 * @param {'leads'|'ecommerce'|'mixed'} reportType
 */
export function reportTypeIssue(metaRows = [], reportType = "mixed") {
  const spendByKind = { ecommerce: 0, leads: 0, other: 0 };
  let metaSpend = 0;
  for (const m of metaRows) {
    const value = Number(m.spend) || 0;
    metaSpend += value;
    spendByKind[objectiveKind(m.objective)] += value;
  }
  let typeIssue = null;
  if (reportType === "leads" && spendByKind.ecommerce >= 5) {
    typeIssue = `הדוח מוגדר לידים בלבד אבל יש קמפייני מכירה במטא (₪${round(spendByKind.ecommerce)})`;
  } else if (
    reportType === "ecommerce" &&
    spendByKind.leads > metaSpend * 0.5
  ) {
    typeIssue = `הדוח מוגדר איקומרס אבל רוב ההוצאה במטא על קמפייני לידים (₪${round(spendByKind.leads)})`;
  }
  return {
    typeIssue,
    metaSpend: round(metaSpend),
    spendByObjective: {
      ecommerce: round(spendByKind.ecommerce),
      leads: round(spendByKind.leads),
      other: round(spendByKind.other),
    },
  };
}

/**
 * @param {{ metaRows: Array<{campaign_id:string,campaign_name?:string,objective?:string,spend:number}>,
 *           aiosRows: Array<{campaign_id:string,campaign_name?:string,spend:number}>,
 *           reportType?: 'leads'|'ecommerce'|'mixed' }} input
 */
export function compareReportToMeta({
  metaRows = [],
  aiosRows = [],
  reportType = "mixed",
}) {
  const aios = new Map(aiosRows.map((r) => [String(r.campaign_id), r]));
  const meta = new Map(metaRows.map((r) => [String(r.campaign_id), r]));
  const mismatches = [];
  let aiosSpend = 0;

  for (const m of metaRows) {
    const metaValue = Number(m.spend) || 0;
    const a = aios.get(String(m.campaign_id));
    const aiosValue = Number(a?.spend) || 0;
    const tolerance = Math.max(5, metaValue * 0.02);
    if (!a && metaValue >= 5) {
      mismatches.push({
        kind: "missing_in_aios",
        campaign_id: m.campaign_id,
        campaign_name: m.campaign_name,
        meta: round(metaValue),
        aios: 0,
      });
    } else if (a && Math.abs(metaValue - aiosValue) > tolerance) {
      mismatches.push({
        kind: "spend",
        campaign_id: m.campaign_id,
        campaign_name: m.campaign_name,
        meta: round(metaValue),
        aios: round(aiosValue),
      });
    }
  }
  for (const a of aiosRows) {
    aiosSpend += Number(a.spend) || 0;
    if (!meta.has(String(a.campaign_id)) && (Number(a.spend) || 0) >= 5) {
      mismatches.push({
        kind: "missing_in_meta",
        campaign_id: a.campaign_id,
        campaign_name: a.campaign_name,
        meta: 0,
        aios: round(a.spend),
      });
    }
  }

  const { typeIssue, metaSpend, spendByObjective } = reportTypeIssue(
    metaRows,
    reportType,
  );

  return {
    ok: mismatches.length === 0 && !typeIssue,
    meta_spend: metaSpend,
    aios_spend: round(aiosSpend),
    spend_by_objective: spendByObjective,
    report_type: reportType,
    type_issue: typeIssue,
    mismatches,
  };
}
