/**
 * Canned platform data for Staging and tests (AIO-238). Refuses to exist in
 * Production so a stray `source: "fixture"` can never stand in for real
 * platform numbers.
 */
import { isNonProductionAppEnv } from "../_shared/app-env.ts";
import { ReconcileSourceError } from "../_shared/reconcile/errors.ts";
import { isRecord } from "../_shared/reconcile/json.ts";
import type {
  AccountInfo,
  CampaignDayRow,
  PlatformSource,
  ReconcileTable,
  SourceErrorKind,
} from "../_shared/reconcile/types.ts";

export type FixtureTable = {
  account: AccountInfo;
  rows: CampaignDayRow[];
  error?: { kind: SourceErrorKind; message: string };
};

/** A source answering from `fixtures` (by table id), which may come straight from a request body. */
export function createFixtureSource(
  fixtures: Record<string, unknown>,
  appEnv: string | undefined | null,
): PlatformSource {
  if (!isNonProductionAppEnv(appEnv)) {
    throw new Error("fixture source is not allowed in production");
  }
  const get = (table: ReconcileTable) => {
    const fx = fixtures[table.id];
    if (!isFixtureTable(fx)) {
      throw new ReconcileSourceError("config", `no fixture for ${table.id}`);
    }
    if (fx.error) {
      throw new ReconcileSourceError(fx.error.kind, fx.error.message);
    }
    return fx;
  };
  return {
    name: "fixture",
    account: (table) => Promise.resolve().then(() => get(table).account),
    campaignDays: (table, window) =>
      Promise.resolve().then(() => ({
        rows: get(table).rows.filter(
          (r) => r.date >= window.start && r.date <= window.end,
        ),
      })),
  };
}

/** A fixture has an account and a list of rows; anything else counts as no fixture. */
function isFixtureTable(value: unknown): value is FixtureTable {
  return (
    isRecord(value) && isRecord(value.account) && Array.isArray(value.rows)
  );
}
