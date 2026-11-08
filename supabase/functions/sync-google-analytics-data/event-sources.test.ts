import { assertEquals } from "jsr:@std/assert@1";
import {
  AUTOMATIC_EVENTS,
  eventSourceRows,
  eventSourcesRequest,
} from "./event-sources.ts";

Deno.test(
  "events are asked for by day and source / medium, without GA's automatic events",
  () => {
    const request = eventSourcesRequest("2026-10-24", "2026-11-07");
    assertEquals(
      request.dimensions.map((d) => d.name),
      ["date", "eventName", "sessionSourceMedium"],
    );
    assertEquals(
      request.dimensionFilter.notExpression.filter.inListFilter.values,
      AUTOMATIC_EVENTS,
    );
    assertEquals(request.dateRanges, [
      { startDate: "2026-10-24", endDate: "2026-11-07" },
    ]);
  },
);

Deno.test("each row is stored with its event, source and day", () => {
  assertEquals(
    eventSourceRows([
      {
        dimensionValues: [
          { value: "20261105" },
          { value: "ticket_upload" },
          { value: "facebook / paid" },
        ],
        metricValues: [{ value: "12" }, { value: "14" }],
      },
      {
        dimensionValues: [
          { value: "20261105" },
          { value: "sign_up" },
          { value: "" },
        ],
        metricValues: [{ value: "3" }, { value: "0" }],
      },
    ]),
    [
      {
        report_type: "event_source",
        event_name: "ticket_upload",
        source_medium: "facebook / paid",
        date: "2026-11-05",
        event_count: 14,
        key_events: 14,
      },
      {
        report_type: "event_source",
        event_name: "sign_up",
        source_medium: "(not set)",
        date: "2026-11-05",
        event_count: 3,
        key_events: 0,
      },
    ],
  );
});

Deno.test("a failed report stores nothing", () => {
  assertEquals(eventSourceRows(undefined), []);
});
