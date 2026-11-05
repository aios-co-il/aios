import { describe, expect, test } from "vitest";

import {
  catalogJobNames,
  scheduledJobNames,
  uncatalogedJobs,
} from "./check-cron-catalog.ts";

describe("check-cron-catalog", () => {
  test("job names come from cron.schedule calls, across lines", () => {
    const sql = `PERFORM cron.schedule(
      'carmen-manager-round-15m',
      '7,22,37,52 * * * *', $cron$ select 1 $cron$);
    select cron.schedule('cleanup-automation-executions', '27 3 * * *', 'x');
    -- cron.alter_job(job_id, schedule := '30 4,5 * * 0');`;
    expect([...scheduledJobNames(sql)]).toEqual([
      "carmen-manager-round-15m",
      "cleanup-automation-executions",
    ]);
  });

  test("catalog keys are the quoted object keys", () => {
    const source = `export const X = {
  "carmen-reconcile-nightly": {
    label: "בדיקת דוחות לילית",
  },
};`;
    expect([...catalogJobNames(source)]).toEqual(["carmen-reconcile-nightly"]);
  });

  test("a scheduled job missing from the catalog is reported", () => {
    expect(
      uncatalogedJobs(
        new Set(["carmen-reconcile-nightly", "new-job"]),
        new Set(["carmen-reconcile-nightly"]),
      ),
    ).toEqual(["new-job"]);
  });
});
