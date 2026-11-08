#!/usr/bin/env node
/**
 * Guard: only supabase/functions/_shared/campaign-goal/ decides a campaign's
 * goal or counts its results, so the reports, dashboards, pulse and Carmen
 * show the same goal and the same leads or purchases (AIO-489).
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** The shared module; everything in it may classify. */
export const CAMPAIGN_GOAL_MODULE = "supabase/functions/_shared/campaign-goal/";

/**
 * Files that may read a campaign objective outside the module: the objective
 * table the module imports, and the sync that stamps the module's inputs
 * (`campaign_type`, `result_kind`) on the rows it writes.
 */
export const ALLOWED_FILES = new Set([
  "supabase/functions/_shared/meta-ads/campaign-objectives.ts",
  "supabase/functions/_shared/fbInsights.ts",
]);

/** A Meta campaign objective string literal, as in "OUTCOME_SALES". */
const OBJECTIVE = `["'\`]OUTCOME_[A-Z_]+["'\`]`;

/** The module's goal and result functions; a second definition is a copy. */
const RESULT_GETTERS = [
  "getFacebookFormLeadsFromData",
  "getExplicitLeadFieldsFromData",
  "getMessagingLeadsFromData",
  "getLeadsFromData",
  "getRevenueFromData",
  "getPurchasesFromData",
  "getAdsPurchasesFromData",
  "getAddToCartFromData",
  "hasAddToCartMetric",
  "adsRowOutcomes",
  "goalResultCount",
  "reportCampaignGoalOf",
  "isEcommerceReportTable",
  "reportTableGoal",
];

const TABLE_TYPE_RULE =
  "a table's goal read from campaign_type (use isEcommerceReportTable)";

/**
 * Rules a file may skip, each with its reason.
 */
export const KNOWN_GAPS = new Map<string, Array<string>>([
  // Writer: picks which Google metrics a Make blueprint syncs per table type.
  ["supabase/functions/make-api/index.ts", [TABLE_TYPE_RULE]],
]);

/** One way a file can decide a goal or count results on its own. */
type Rule = { name: string; pattern: RegExp };

export const RULES: Array<Rule> = [
  {
    name: "a retired goal classifier",
    pattern:
      /\b(classifyPulseCampaignGoal|tableReportGoal|integrationTypeToGoal|isFacebookTrafficCampaign|campaignTypeByPlatform|objectiveKind|rowConfirmsSalesObjective)\b/,
  },
  {
    name: "a Meta objective read as a goal (metaObjectiveGoal)",
    pattern: /\bmetaObjectiveGoal\s*\(/,
  },
  {
    name: "a campaign objective compared to a goal objective",
    pattern: new RegExp(
      [
        // objective === "OUTCOME_SALES", "OUTCOME_SALES" !== objective
        `[!=]==?\\s*${OBJECTIVE}`,
        `${OBJECTIVE}\\s*[!=]==?`,
        // ["OUTCOME_LEADS", …].includes(objective), new Set(["OUTCOME_…"])
        `${OBJECTIVE}[^\\]\\n]*\\]\\s*\\)?\\s*\\.(includes|has)\\(`,
        `new Set\\(\\[[^\\]\\n]*${OBJECTIVE}`,
        // objective.includes("OUTCOME_SALES"), .startsWith(…), case "OUTCOME_…":
        `\\.(includes|startsWith|endsWith|has|indexOf)\\(\\s*${OBJECTIVE}`,
        `\\bcase\\s+${OBJECTIVE}`,
      ].join("|"),
    ),
  },
  {
    name: TABLE_TYPE_RULE,
    pattern: /campaign_type\s*[!=]==?\s*["'](ecommerce|leads?)["']/,
  },
  {
    name: "results counted from all_conversions (use goalResultCount)",
    // A fallback (`?? data.all_conversions`) or a list of result fields
    // (["leads", "conversions", "all_conversions"]); a sync's field list is not.
    pattern:
      /(\?\?|\|\|)\s*[\w?.]*all_conversions|["']conversions["']\s*,\s*["']all_conversions["']/,
  },
  {
    name: "a second copy of a result getter",
    pattern: new RegExp(
      `\\b(?:function|const|let)\\s+(${RESULT_GETTERS.join("|")})\\b`,
    ),
  },
];

// Runs after the constants above: they are not hoisted like the functions.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runGuard(resolve(dirname(fileURLToPath(import.meta.url)), ".."));
}

/** Whether the guard reads `path`: app and edge code, not tests or fixtures. */
export function isGuardedPath(path: string): boolean {
  if (!/^(src|supabase\/functions)\/.*\.(ts|tsx|mjs|js)$/.test(path)) {
    return false;
  }
  if (path.startsWith(CAMPAIGN_GOAL_MODULE) || ALLOWED_FILES.has(path)) {
    return false;
  }
  return !/(\.test\.|\/tests?\/|[Ff]ixture)/.test(path);
}

/** Each `path:line: rule` hit in one file's source. */
export function findViolations(path: string, source: string): Array<string> {
  const hits: Array<string> = [];
  source.split("\n").forEach((line, index) => {
    for (const rule of RULES) {
      if (KNOWN_GAPS.get(path)?.includes(rule.name)) {
        continue;
      }
      if (rule.pattern.test(line)) {
        hits.push(`${path}:${index + 1}: ${rule.name}`);
      }
    }
  });
  return hits;
}

/** Checks every tracked guarded file under `root`; exits 1 on a hit. */
function runGuard(root: string): void {
  const tracked = execFileSync("git", ["ls-files", "-z"], {
    cwd: root,
    encoding: "utf8",
  })
    .split("\0")
    .filter(isGuardedPath);
  const hits = tracked.flatMap((path) =>
    findViolations(path, readFileSync(join(root, path), "utf8")),
  );
  if (hits.length > 0) {
    console.error(
      `Only ${CAMPAIGN_GOAL_MODULE} may decide a campaign goal or count its results. Import it instead:`,
    );
    for (const hit of hits) {
      console.error(`  ${hit}`);
    }
    process.exit(1);
  }
}
