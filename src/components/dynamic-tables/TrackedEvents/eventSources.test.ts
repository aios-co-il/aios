import { describe, expect, it } from "vitest";
import { OTHER_SOURCES, summarizeEventSources } from "./eventSources";
import type { TrackedEventRecord } from "./trackedEvents";

const source = (
  date: string,
  event_name: string,
  source_medium: string,
  event_count: number,
): TrackedEventRecord => ({
  _source: "google_analytics",
  data: {
    report_type: "event_source",
    date,
    event_name,
    source_medium,
    event_count,
  },
});

const TRACKED = [
  { event: "ticket_upload", label: "העלאת כרטיס" },
  { event: "sign_up", label: "הרשמה לאתר" },
];

describe("summarizeEventSources", () => {
  it("sums each source per followed event, biggest source first", () => {
    const table = summarizeEventSources(
      [
        source("2026-11-01", "ticket_upload", "facebook / paid", 30),
        source("2026-11-02", "ticket_upload", "facebook / paid", 10),
        source("2026-11-01", "sign_up", "facebook / paid", 5),
        source("2026-11-01", "ticket_upload", "google / organic", 8),
        source("2026-11-01", "sign_up", "(direct) / (none)", 12),
        source("2026-11-01", "view_item", "facebook / paid", 900),
      ],
      TRACKED,
    );
    expect(table?.rows).toStrictEqual([
      {
        source: "facebook / paid",
        counts: { ticket_upload: 40, sign_up: 5 },
        total: 45,
      },
      { source: "(direct) / (none)", counts: { sign_up: 12 }, total: 12 },
      { source: "google / organic", counts: { ticket_upload: 8 }, total: 8 },
    ]);
    expect(table?.totals).toStrictEqual({ ticket_upload: 48, sign_up: 17 });
  });

  it("sums the sources past the top eight under אחר", () => {
    const records = Array.from({ length: 10 }, (_, i) =>
      source("2026-11-01", "sign_up", `site${i} / referral`, 20 - i),
    );
    const table = summarizeEventSources(records, TRACKED);
    expect(table?.rows).toHaveLength(9);
    expect(table?.rows[8]).toStrictEqual({
      source: OTHER_SOURCES,
      counts: { sign_up: 11 + 12 },
      total: 23,
    });
  });

  it("is null until the sync has collected any source rows", () => {
    expect(
      summarizeEventSources(
        [
          {
            _source: "google_analytics",
            data: {
              report_type: "event_total",
              event_name: "sign_up",
              event_count: 3,
            },
          },
        ],
        TRACKED,
      ),
    ).toBeNull();
  });

  it("is an empty table when sources exist but no followed event has one", () => {
    expect(
      summarizeEventSources(
        [source("2026-11-01", "view_item", "facebook / paid", 9)],
        TRACKED,
      ),
    ).toStrictEqual({ rows: [], totals: { ticket_upload: 0, sign_up: 0 } });
  });
});
