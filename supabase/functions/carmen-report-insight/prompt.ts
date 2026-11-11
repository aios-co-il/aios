import type {
  InsightFigures,
  InsightScope,
  ReportInsightRequest,
} from "./types.ts";

const SCOPE_NAMES: Record<InsightScope["scope"], string> = {
  all: "כל הקמפיינים",
  ecommerce: "קמפייני מכירות",
  leads: "קמפייני לידים",
  traffic: "קמפייני תנועה",
};

/**
 * Carmen's prompt for a short read of the report. The ratios are computed
 * here so the model compares numbers instead of doing arithmetic on them.
 */
export function insightPrompt(request: ReportInsightRequest): string {
  const report = request.scopes.map((scope) => ({
    חלק: SCOPE_NAMES[scope.scope],
    תקופה_נוכחית: figuresOf(scope.figures),
    תקופה_קודמת: scope.previous ? figuresOf(scope.previous) : null,
    קמפיינים: scope.campaigns.map((campaign) => ({
      שם: campaign.name,
      פלטפורמה: campaign.channel === "facebook" ? "Meta" : "Google Ads",
      מצב: campaign.on === null ? "לא ידוע" : campaign.on ? "דולק" : "כבוי",
      ...figuresOf(campaign.figures),
    })),
  }));
  return [
    "את כרמן, מנהלת הקמפיינים של AIOS. המשתמש ביקש ממך תובנה על דוח הקמפיינים שלפניו.",
    `המטבע: ${request.currency}. הנתונים (JSON):`,
    JSON.stringify(report),
    "כתבי בעברית 2 עד 4 משפטים קצרים: מה הדבר החשוב ביותר בנתונים, מה השתנה מול התקופה הקודמת אם יש, והמלצה מעשית אחת.",
    "הסתמכי רק על המספרים שבנתונים; אל תמציאי נתון שאין בהם. בלי כותרות, בלי רשימות ובלי פתיח.",
  ].join("\n");
}

/** A scope's or campaign's figures with the ratios a marketer reads. */
function figuresOf(figures: InsightFigures) {
  return {
    הוצאה: round(figures.spend),
    חשיפות: figures.impressions,
    קליקים: figures.clicks,
    CTR_אחוז: ratio(figures.clicks * 100, figures.impressions),
    עלות_לקליק: ratio(figures.spend, figures.clicks),
    לידים: figures.leads,
    עלות_לליד: ratio(figures.spend, figures.leads),
    רכישות: figures.purchases,
    הכנסות: round(figures.revenue),
    ROAS: ratio(figures.revenue, figures.spend),
    סשנים: figures.sessions,
  };
}

/** a / b to two places; null when b is zero. */
function ratio(a: number, b: number): number | null {
  return b > 0 ? round(a / b) : null;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
