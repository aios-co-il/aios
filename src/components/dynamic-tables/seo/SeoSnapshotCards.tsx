import { Card, CardContent } from "@/components/ui/card";
import { ArrowUp, ArrowDown, Minus } from "lucide-react";
import { keywordTop20Rank } from "@/lib/gscPosition";
import type { JsonObject } from "@/lib/jsonReaders";
import { getVal, type SnapshotValue } from "./snapshotValues";

/** A tracked/organic keyword row; only the rank-related fields are read here. */
interface SnapshotKeyword {
  keyword?: unknown;
  position?: unknown;
  gsc_position?: unknown;
  ahrefs_position?: unknown;
  best_position?: unknown;
  _source?: string;
}

interface SeoSnapshotCardsProps {
  snapshot: JsonObject;
  prevMonth: JsonObject;
  campaignStart: JsonObject;
  /** Latest GA organic sessions (current month) — overrides Ahrefs org_traffic */
  gaOrganicSessions?: number | null;
  /** Previous month GA organic sessions */
  gaOrganicSessionsPrev?: number | null;
  /** Live tracked-keyword list — used for Top 3/Top 20 counts */
  trackedKeywords?: SnapshotKeyword[];
  /** Live organic-keyword list — used as additional input for Top 3/Top 20 counts */
  organicKeywords?: SnapshotKeyword[];
}

function ChangeIndicator({
  current,
  previous,
  label,
  inverse,
}: {
  current?: number;
  previous?: number;
  label: string;
  inverse?: boolean;
}) {
  if (current == null || previous == null) return null;
  const diff = current - previous;
  if (diff === 0)
    return (
      <span className="text-xs text-muted-foreground flex items-center gap-0.5">
        <Minus className="h-3 w-3" />
        {label}
      </span>
    );
  const isPositive = inverse ? diff < 0 : diff > 0;
  return (
    <span
      className={`text-xs flex items-center gap-0.5 ${isPositive ? "text-green-600" : "text-red-500"}`}
    >
      {isPositive ? (
        <ArrowUp className="h-3 w-3" />
      ) : (
        <ArrowDown className="h-3 w-3" />
      )}
      {Math.abs(diff).toLocaleString()} {label}
    </span>
  );
}

function countAtOrBelow(
  kws: SnapshotKeyword[] | undefined,
  maxPos: number,
): number {
  if (!Array.isArray(kws)) return 0;
  let n = 0;
  for (const kw of kws) {
    const rank =
      keywordTop20Rank(kw) ??
      keywordTop20Rank({
        position: kw?.best_position,
        gsc_position: kw?.gsc_position,
      });
    if (rank && rank.position >= 1 && rank.position <= maxPos) n++;
  }
  return n;
}

export function SeoSnapshotCards({
  snapshot,
  prevMonth,
  campaignStart,
  gaOrganicSessions,
  gaOrganicSessionsPrev,
  trackedKeywords,
  organicKeywords,
}: SeoSnapshotCardsProps) {
  // Live fallback counts (merge tracked + organic, dedup by keyword)
  const mergedByKw = new Map<string, SnapshotKeyword>();
  for (const kw of trackedKeywords || []) {
    const name = String(kw?.keyword || "")
      .toLowerCase()
      .trim();
    if (name) mergedByKw.set(name, kw);
  }
  for (const kw of organicKeywords || []) {
    const name = String(kw?.keyword || "")
      .toLowerCase()
      .trim();
    if (name && !mergedByKw.has(name)) mergedByKw.set(name, kw);
  }
  const liveList = Array.from(mergedByKw.values());
  const liveTop3 = countAtOrBelow(liveList, 3);
  const liveTop20 = countAtOrBelow(liveList, 20);

  const snapTop3 = getVal(snapshot, "org_keywords_top3");
  const effectiveTop3 = liveTop3 > Number(snapTop3 ?? 0) ? liveTop3 : snapTop3;
  // There is no historical org_keywords_top20 field. Use the merged live keyword
  // rows so a Top 10 snapshot is never mislabeled as Top 20.
  const effectiveTop20 = liveList.length > 0 ? liveTop20 : undefined;
  const snapTotal = getVal(snapshot, "org_keywords_total");
  const effectiveTotal =
    liveList.length > 0 && (!snapTotal || snapTotal === 0)
      ? liveList.length
      : snapTotal;

  const metrics = [
    {
      keys: ["domain_rating", "dr"],
      label: "דירוג דומיין (DR)",
      icon: "🏆",
      isOrganic: false,
      override: undefined as SnapshotValue,
    },
    {
      keys: ["org_traffic"],
      label: "תנועה אורגנית",
      icon: "📈",
      isOrganic: true,
      override: undefined as SnapshotValue,
    },

    {
      keys: ["org_keywords_top3"],
      label: "מילות מפתח (Top 3)",
      icon: "🥇",
      isOrganic: false,
      override: effectiveTop3,
    },
    {
      keys: ["org_keywords_top20"],
      label: "מילות מפתח (Top 20)",
      icon: "🏆",
      isOrganic: false,
      override: effectiveTop20,
    },
    {
      keys: ["org_keywords_total"],
      label: "סה״כ מילות מפתח",
      icon: "🔑",
      isOrganic: false,
      override: effectiveTotal,
    },
    {
      keys: ["referring_domains", "referring_domains_all_time"],
      label: "דומיינים מפנים",
      icon: "🔗",
      isOrganic: false,
      override: undefined as SnapshotValue,
    },
    {
      keys: ["backlinks_live"],
      label: "קישורים נכנסים (פעילים)",
      icon: "🌐",
      isOrganic: false,
      override: undefined as SnapshotValue,
    },
    {
      keys: ["backlinks_all_time"],
      label: "קישורים נכנסים (כולל)",
      icon: "📊",
      isOrganic: false,
      override: undefined as SnapshotValue,
    },
  ]
    .map((m) => {
      if (m.isOrganic && gaOrganicSessions != null) {
        return {
          ...m,
          value: gaOrganicSessions,
          prevValue: gaOrganicSessionsPrev ?? undefined,
          campaignValue: undefined,
          gaSource: true,
        };
      }
      return {
        ...m,
        value:
          m.override !== undefined ? m.override : getVal(snapshot, ...m.keys),
        prevValue: getVal(prevMonth, ...m.keys),
        campaignValue: getVal(campaignStart, ...m.keys),
        gaSource: false,
      };
    })
    .filter((m) => m.value !== undefined);

  if (metrics.length === 0) return null;

  return (
    <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
      {metrics.map((metric, idx) => (
        <Card key={idx} className="border-primary/10">
          <CardContent className="p-4 text-center">
            <span className="text-xl mb-1 block">{metric.icon}</span>
            <p className="text-xs text-muted-foreground mb-1">
              {metric.label}
              {metric.gaSource && (
                <span className="ml-1 text-[10px] text-green-600 font-medium">
                  (Analytics)
                </span>
              )}
            </p>
            <p className="text-2xl font-bold text-primary">
              {typeof metric.value === "number"
                ? metric.value.toLocaleString()
                : metric.value}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
