import type { Json } from "@/integrations/supabase/types";
import {
  asJsonArray,
  asJsonObject,
  readDateInput,
  readField,
  readString,
  readText,
  type JsonObject,
  type SeoReportRow,
} from "@/lib/dynamic-tables-b17";
import { useMemo, useState } from "react";
import DOMPurify from "dompurify";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Globe, FileText, Calendar } from "lucide-react";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import { SeoSnapshotCards } from "./seo/SeoSnapshotCards";

import { SeoKeywordsTable } from "./seo/SeoKeywordsTable";
import { filterValidSeoReports } from "./seo/reportValidity";

interface PublicGscKeyword {
  keyword: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

interface PublicSeoViewProps {
  tableName: string;
  reports: SeoReportRow[];
  /** Optional GSC data aggregated per keyword — enables enrichment + GSC-only rows. */
  gscData?: PublicGscKeyword[];
  /** Optional GSC keyword aggregates per historical period — enables monthly/3M/yearly change columns. */
  gscMultiPeriod?: {
    prevMonth: PublicGscKeyword[];
    threeMonth: PublicGscKeyword[];
    yearly: PublicGscKeyword[];
  } | null;
  /** Optional GA monthly non-paid sessions — replaces the Ahrefs traffic chart with real Analytics data. */
  gaOrganicByMonth?: { month: string; sessions: number }[];
  /** Initial language filter persisted on the SEO crm_table — read-only in public view. */
  initialLangFilter?: "all" | "he" | "en";
  /** Client UUID — preferred relevance persist key (matches in-app). */
  clientId?: string | null;
  /** Server-persisted manual relevance overrides for this client. */
  forceRelevant?: string[];
  forceIrrelevant?: string[];
}

function keywordKey(kw: Json): string {
  return String(readField(kw, "keyword") || "")
    .toLowerCase()
    .trim();
}

function normalizeKeyword(keyword: Json) {
  const kw = asJsonObject(keyword);
  return {
    keyword: String(kw.keyword || ""),
    position: kw.position ?? kw.best_position ?? null,
    traffic: kw.traffic ?? kw.sum_traffic ?? 0,
    volume: kw.volume ?? kw.search_volume ?? null,
    kd: kw.kd ?? kw.keyword_difficulty ?? null,
    cpc: kw.cpc ?? kw.cost_per_click ?? null,
    url: kw.url ?? kw.best_position_url ?? "",
    position_prev_month: kw.position_prev_month ?? null,
    position_campaign_start: kw.position_campaign_start ?? null,
    traffic_prev_month: kw.traffic_prev_month ?? null,
    traffic_campaign_start: kw.traffic_campaign_start ?? null,
  };
}

export function PublicSeoView({
  tableName,
  reports,
  gscData = [],
  gscMultiPeriod = null,
  gaOrganicByMonth = [],
  initialLangFilter,
  clientId = null,
  forceRelevant = [],
  forceIrrelevant = [],
}: PublicSeoViewProps) {
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const validReports = useMemo(() => filterValidSeoReports(reports), [reports]);

  const selectedReport = useMemo(() => {
    if (selectedReportId)
      return (
        validReports.find((r) => r.id === selectedReportId) || validReports[0]
      );
    return validReports[0];
  }, [validReports, selectedReportId]);

  const reportData = asJsonObject(selectedReport?.report_data);
  const snapshot = asJsonObject(reportData.snapshot);
  const snapshotPrevMonth = asJsonObject(
    reportData.snapshot_prev_month || reportData.snapshot_prev,
  );
  const snapshotCampaignStart = asJsonObject(
    reportData.snapshot_campaign_start,
  );
  const campaignStartDate =
    readDateInput(reportData, "campaign_start_date") ||
    readDateInput(snapshotCampaignStart, "date");

  // Comparison cache (3-month / yearly)
  const comparison = useMemo(() => {
    const cached = asJsonObject(selectedReport?.comparison_data);
    const threeMonth = new Map<string, JsonObject>();
    const yearly = new Map<string, JsonObject>();
    if (cached.threeMonth) {
      for (const [k, v] of Object.entries(asJsonObject(cached.threeMonth)))
        threeMonth.set(k, asJsonObject(v));
    }
    if (cached.yearly) {
      for (const [k, v] of Object.entries(asJsonObject(cached.yearly)))
        yearly.set(k, asJsonObject(v));
    }
    return { threeMonth, yearly };
  }, [selectedReport?.id]);

  // Previous month report for prev-month positions fallback
  const prevMonthMap = useMemo(() => {
    const idx = validReports.findIndex((r) => r.id === selectedReport?.id);
    const prev =
      idx >= 0 && idx < validReports.length - 1 ? validReports[idx + 1] : null;
    const map = new Map<string, Json>();
    if (!prev) return map;
    const rd = asJsonObject(prev.report_data);
    const all = [
      ...asJsonArray(rd.tracked_keywords),
      ...asJsonArray(rd.organic_keywords),
    ];
    for (const keyword of all) {
      const kw = asJsonObject(keyword);
      const name = String(kw.keyword || "").toLowerCase();
      if (!map.has(name))
        map.set(name, kw.position ?? kw.best_position ?? null);
    }
    return map;
  }, [validReports, selectedReport?.id]);

  // Map GSC keywords (already aggregated by SharedTable) for fast lookup.
  const gscMap = useMemo(() => {
    const m = new Map<string, PublicGscKeyword>();
    for (const g of gscData) {
      const name = String(g.keyword || "")
        .toLowerCase()
        .trim();
      if (name) m.set(name, g);
    }
    return m;
  }, [gscData]);

  // Historical GSC period maps — fallback for monthly / 3-month / yearly position changes
  // when Ahrefs comparison_data isn't cached on the report.
  const buildPeriodMap = (rows?: PublicGscKeyword[]) => {
    const m = new Map<string, PublicGscKeyword>();
    for (const g of rows || []) {
      const name = String(g.keyword || "")
        .toLowerCase()
        .trim();
      if (name) m.set(name, g);
    }
    return m;
  };
  const gscPrevMonthMap = useMemo(
    () => buildPeriodMap(gscMultiPeriod?.prevMonth),
    [gscMultiPeriod],
  );
  const gscThreeMonthMap = useMemo(
    () => buildPeriodMap(gscMultiPeriod?.threeMonth),
    [gscMultiPeriod],
  );
  const gscYearlyMap = useMemo(
    () => buildPeriodMap(gscMultiPeriod?.yearly),
    [gscMultiPeriod],
  );

  function enrich(kw: Json) {
    const n = normalizeKeyword(kw);
    const lower = String(n.keyword).toLowerCase().trim();
    const api3 = comparison.threeMonth.get(lower);
    const apiY = comparison.yearly.get(lower);
    const gscRow = gscMap.get(lower);

    let prevPos = n.position_prev_month ?? prevMonthMap.get(lower) ?? null;
    if (prevPos == null && api3?.best_position_prev != null)
      prevPos = api3.best_position_prev;
    if (prevPos == null) {
      const gscPrev = gscPrevMonthMap.get(lower)?.position;
      if (gscPrev != null) prevPos = gscPrev;
    }

    let pos3m: Json = api3?.best_position_prev ?? null;
    if (pos3m == null) {
      const gsc3 = gscThreeMonthMap.get(lower)?.position;
      if (gsc3 != null) pos3m = gsc3;
    }

    let posYear: Json = apiY?.best_position_prev ?? null;
    if (posYear == null) {
      const gscY = gscYearlyMap.get(lower)?.position;
      if (gscY != null) posYear = gscY;
    }

    const api = api3 || apiY;
    if (n.volume == null && api?.volume != null) n.volume = api.volume;
    if (n.kd == null && api?.keyword_difficulty != null)
      n.kd = api.keyword_difficulty;
    if (n.cpc == null && api?.cpc != null) n.cpc = api.cpc;

    return {
      ...n,
      position: n.position ?? gscRow?.position ?? null,
      position_prev_month: prevPos,
      position_3month: pos3m,
      position_yearly: posYear,
      gsc_clicks: gscRow?.clicks ?? null,
      gsc_impressions: gscRow?.impressions ?? null,
      gsc_ctr: gscRow?.ctr ?? null,
      gsc_position: gscRow?.position ?? null,
    };
  }

  const projectName = readText(reportData, "project_name");
  const reportHtml = readString(reportData, "html");
  const rawOrganic = asJsonArray(reportData.organic_keywords);
  const rawTracked = asJsonArray(reportData.tracked_keywords);

  const organicKeywords = useMemo(() => {
    const enriched = rawOrganic.map(enrich);
    const existing = new Set<string>();
    for (const kw of rawOrganic) existing.add(keywordKey(kw));
    for (const kw of rawTracked) existing.add(keywordKey(kw));

    const extra = new Map<string, JsonObject>();
    for (const [name, kw] of comparison.threeMonth) {
      if (!existing.has(name)) extra.set(name, kw);
    }
    for (const [name, kw] of comparison.yearly) {
      if (!existing.has(name) && !extra.has(name)) extra.set(name, kw);
    }
    for (const [, kw] of extra) {
      enriched.push(
        enrich({
          keyword: kw.keyword,
          position: kw.best_position,
          traffic: kw.sum_traffic,
          volume: kw.volume,
          kd: kw.keyword_difficulty,
          cpc: kw.cpc,
          url: kw.best_position_url,
        }),
      );
    }
    return enriched;
  }, [rawOrganic, rawTracked, comparison, prevMonthMap, gscMap]);

  const trackedKeywords = useMemo(
    () => rawTracked.map(enrich),
    [rawTracked, comparison, prevMonthMap, gscMap],
  );

  // GSC-only keywords: appear in GSC but not in Ahrefs organic/tracked.
  // Keep `position` populated (same as SeoDashboardView) so Top 20 מקודמים
  // on shared links includes GSC-ranked terms — null position previously hid them.
  const gscOnlyKeywords = useMemo(() => {
    if (gscData.length === 0) return [];
    const ahrefsNames = new Set<string>();
    for (const kw of rawOrganic) ahrefsNames.add(keywordKey(kw));
    for (const kw of rawTracked) ahrefsNames.add(keywordKey(kw));
    return gscData
      .filter((g) => {
        const name = String(g.keyword || "")
          .toLowerCase()
          .trim();
        return name && !ahrefsNames.has(name);
      })
      .map((g) => {
        const key = String(g.keyword || "")
          .toLowerCase()
          .trim();
        const prev = gscPrevMonthMap.get(key)?.position ?? null;
        const m3 = gscThreeMonthMap.get(key)?.position ?? null;
        const y1 = gscYearlyMap.get(key)?.position ?? null;
        return {
          keyword: g.keyword,
          position: g.position ?? null,
          traffic: 0,
          volume: null,
          kd: null,
          cpc: null,
          url: "",
          position_prev_month: prev,
          position_3month: m3,
          position_yearly: y1,
          gsc_clicks: g.clicks,
          gsc_impressions: g.impressions,
          gsc_ctr: g.ctr,
          gsc_position: g.position ?? null,
          _source: "gsc" as const,
        };
      });
  }, [
    gscData,
    rawOrganic,
    rawTracked,
    gscPrevMonthMap,
    gscThreeMonthMap,
    gscYearlyMap,
  ]);

  if (!validReports || validReports.length === 0) {
    return (
      <Card className="p-8 text-center" dir="rtl">
        <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
        <h3 className="font-semibold text-lg mb-1">אין דוחות SEO</h3>
        <p className="text-muted-foreground text-sm">
          לא נמצאו דוחות לטבלה זו.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-5" dir="rtl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <Globe className="h-5 w-5 text-primary shrink-0" />
          <span className="font-semibold text-base sm:text-lg break-words">
            {readText(reportData, "domain") ||
              selectedReport?.domain ||
              tableName}
          </span>
          {projectName && <Badge variant="outline">{projectName}</Badge>}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground w-full sm:w-auto min-w-0">
          {validReports.length > 1 && (
            <Select
              value={selectedReport?.id || ""}
              onValueChange={(val) => setSelectedReportId(val)}
            >
              <SelectTrigger className="w-full min-w-0 sm:w-[200px] h-8 text-xs">
                <SelectValue placeholder="בחר תאריך דוח" />
              </SelectTrigger>
              <SelectContent>
                {validReports.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    <div className="flex items-center gap-2">
                      <Calendar className="h-3 w-3" />
                      {r.report_date
                        ? format(new Date(r.report_date), "dd MMMM yyyy", {
                            locale: he,
                          })
                        : format(new Date(r.received_at), "dd MMMM yyyy", {
                            locale: he,
                          })}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {campaignStartDate && (
            <Badge variant="secondary">
              תחילת קידום: {format(new Date(campaignStartDate), "dd/MM/yyyy")}
            </Badge>
          )}
          <Badge variant="secondary">{validReports.length} דוחות</Badge>
        </div>
      </div>

      <SeoSnapshotCards
        snapshot={snapshot}
        prevMonth={snapshotPrevMonth}
        campaignStart={snapshotCampaignStart}
        trackedKeywords={trackedKeywords}
        organicKeywords={[...organicKeywords, ...gscOnlyKeywords]}
      />

      <SeoKeywordsTable
        keywords={organicKeywords}
        trackedKeywords={trackedKeywords}
        gscOnlyKeywords={gscOnlyKeywords}
        hasGscData={gscData.length > 0}
        show3Month={comparison.threeMonth.size > 0 || gscThreeMonthMap.size > 0}
        showYearly={comparison.yearly.size > 0 || gscYearlyMap.size > 0}
        defaultTab="top10"
        relevancePersistKey={clientId || undefined}
        initialForceRelevant={forceRelevant}
        initialForceIrrelevant={forceIrrelevant}
        relevanceReadOnly
        initialLangFilter={initialLangFilter}
      />

      {reportHtml && (
        <Card>
          <CardContent className="p-4">
            <div
              className="prose prose-sm dark:prose-invert max-w-none text-right"
              dangerouslySetInnerHTML={{
                __html: DOMPurify.sanitize(reportHtml || "", {
                  FORBID_TAGS: ["script", "style", "iframe", "object", "embed"],
                  FORBID_ATTR: [
                    "onerror",
                    "onload",
                    "onclick",
                    "onmouseover",
                    "onfocus",
                    "onblur",
                  ],
                }),
              }}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
