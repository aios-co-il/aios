// Campaign "Result" as configured in Meta (ad set promoted_object), stored by the
// Facebook sync as `results` / `result_kind` / `result_label` on each record.

/** Keep in sync with RESULT_KIND_LABELS in supabase/functions/_shared/fbInsights.ts. */
export const FACEBOOK_RESULT_KIND_LABELS: Record<string, string> = {
  purchases: 'רכישות',
  initiate_checkout: 'התחלות תשלום',
  add_to_cart: 'הוספות לעגלה',
  add_payment_info: 'הוספת פרטי תשלום',
  view_content: 'צפיות בתוכן',
  search: 'חיפושים',
  leads: 'לידים',
  conversations: 'שיחות',
  video_views: 'צפיות וידאו',
  engagements: 'אינטראקציות',
  link_clicks: 'קליקים על קישור',
  landing_page_views: 'צפיות בדף נחיתה',
};

export type FacebookResultTotals = {
  results: number;
  result_kind: string | null;
  result_label: string | null;
  /** True once rows disagree on the result metric (e.g. objective changed mid-range). */
  result_mixed: boolean;
};

export const emptyFacebookResultTotals = (): FacebookResultTotals => ({
  results: 0,
  result_kind: null,
  result_label: null,
  result_mixed: false,
});

export function facebookResultLabel(kind: string | null | undefined, label?: string | null): string | null {
  if (label) return label;
  if (!kind) return null;
  return FACEBOOK_RESULT_KIND_LABELS[kind] || null;
}

/** Add one stored record's result into a campaign's running totals. */
export function addFacebookResult(
  totals: FacebookResultTotals,
  data: { results?: unknown; result_kind?: unknown; result_label?: unknown } | null | undefined,
): FacebookResultTotals {
  const kind = data?.result_kind ? String(data.result_kind) : null;
  if (!kind) return totals;
  const value = Number(data?.results) || 0;
  if (!totals.result_kind) {
    return {
      results: value,
      result_kind: kind,
      result_label: facebookResultLabel(kind, data?.result_label ? String(data.result_label) : null),
      result_mixed: false,
    };
  }
  if (totals.result_kind !== kind) return { ...totals, result_mixed: true };
  return { ...totals, results: totals.results + value };
}

/** Header label for an ecommerce table: the shared result name, or a generic one when campaigns differ. */
export function facebookResultsColumnLabel(rows: FacebookResultTotals[]): string {
  const kinds = new Set(rows.map((r) => r.result_kind).filter(Boolean));
  if (kinds.size === 1 && !rows.some((r) => r.result_mixed)) {
    const row = rows.find((r) => r.result_kind);
    return facebookResultLabel(row?.result_kind, row?.result_label) || 'תוצאות';
  }
  return 'תוצאות';
}

export function facebookCostPerResult(spend: number, results: number): number {
  return results > 0 ? spend / results : 0;
}
