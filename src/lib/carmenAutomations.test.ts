import { describe, expect, test } from "vitest";

import { asAutomationKey, mapAutomations } from "./carmenAutomations";
import { selectRows } from "./carmenTaskRows";

describe("mapAutomations", () => {
  test("every automation is a row, on when the org never switched it", () => {
    const rows = mapAutomations([]);
    expect(rows.map((r) => r.id)).toEqual([
      "meta_status_check",
      "google_status_check",
      "reconcile_nightly",
    ]);
    expect(rows.every((r) => r.enabled && r.status === "scheduled")).toBe(true);
    expect(rows[0].title).toBe("בדיקת סטטוס קמפיינים — Meta");
  });

  test("a switch stored off pauses only that automation", () => {
    const rows = mapAutomations([
      {
        automation_key: "reconcile_nightly",
        enabled: false,
        updated_at: "2026-11-03T12:00:00Z",
      },
    ]);
    const nightly = rows.find((r) => r.id === "reconcile_nightly");
    expect(nightly?.enabled).toBe(false);
    expect(nightly?.status).toBe("paused");
    expect(rows.filter((r) => r.enabled)).toHaveLength(2);
  });

  test("the אוטומציות filter shows exactly the automation rows", () => {
    const rows = mapAutomations([]);
    expect(selectRows(rows, "automation")).toHaveLength(3);
    expect(selectRows(rows, "system")).toHaveLength(0);
  });

  test("a route segment that names no automation is refused", () => {
    expect(asAutomationKey("meta_status_check")).toBe("meta_status_check");
    expect(asAutomationKey("drop_tables")).toBeNull();
  });
});
