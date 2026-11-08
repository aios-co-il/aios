import { assertEquals } from "jsr:@std/assert@1";
import {
  buildEventUsers,
  funnelStepUsers,
  TOP_SOURCES,
  usersByEvent,
  usersBySource,
} from "./reports.ts";
import { funnelRequest, usersRequest } from "./ga-requests.ts";

const STEPS = [
  { event: "page_view_valuation", label: "דף הערכה" },
  { event: "ticket_upload", label: "העלאת כרטיס" },
  { event: "buy_credits", label: "קניית קרדיטים" },
];

const row = (dims: Array<string>, value: string) => ({
  dimensionValues: dims.map((d) => ({ value: d })),
  metricValues: [{ value }],
});

Deno.test(
  "people are asked for per followed event, optionally by source",
  () => {
    const request = usersRequest(STEPS, "2026-10-24", "2026-11-07", true);
    assertEquals(
      request.dimensions.map((d) => d.name),
      ["eventName", "sessionSourceMedium"],
    );
    assertEquals(request.metrics, [{ name: "totalUsers" }]);
    assertEquals(request.dimensionFilter.filter.inListFilter.values, [
      "page_view_valuation",
      "ticket_upload",
      "buy_credits",
    ]);
  },
);

Deno.test(
  "the funnel is closed, in step order, broken down by source on request",
  () => {
    const plain = funnelRequest(STEPS, "2026-10-24", "2026-11-07", false);
    assertEquals(plain.funnel.isOpenFunnel, false);
    assertEquals(
      plain.funnel.steps.map(
        (s) => s.filterExpression.funnelEventFilter.eventName,
      ),
      ["page_view_valuation", "ticket_upload", "buy_credits"],
    );
    assertEquals("funnelBreakdown" in plain, false);
    const bySource = funnelRequest(STEPS, "2026-10-24", "2026-11-07", true);
    assertEquals(
      bySource.funnelBreakdown?.breakdownDimension.name,
      "sessionSourceMedium",
    );
  },
);

Deno.test("users rows are read per event and per source", () => {
  assertEquals(
    usersByEvent([row(["ticket_upload"], "50"), row(["buy_credits"], "20")]),
    { ticket_upload: 50, buy_credits: 20 },
  );
  const bySource = usersBySource([
    row(["ticket_upload", "google / cpc"], "30"),
    row(["ticket_upload", ""], "5"),
  ]);
  assertEquals(bySource.get("google / cpc"), { ticket_upload: 30 });
  assertEquals(bySource.get("(not set)"), { ticket_upload: 5 });
});

Deno.test("funnel rows give people per step, skipping GA's total rows", () => {
  const stepUsers = funnelStepUsers(
    [
      row(["1. page_view_valuation", "RESERVED_TOTAL"], "100"),
      row(["1. page_view_valuation", "google / cpc"], "80"),
      row(["2. ticket_upload", "google / cpc"], "40"),
      row(["3. buy_credits", "google / cpc"], "10"),
    ],
    STEPS,
    true,
  );
  assertEquals([...stepUsers.keys()], ["google / cpc"]);
  assertEquals(stepUsers.get("google / cpc"), {
    page_view_valuation: 80,
    ticket_upload: 40,
    buy_credits: 10,
  });
});

Deno.test("each step's rate is its share of the step before", () => {
  const result = buildEventUsers({
    steps: STEPS,
    totalUsers: {
      page_view_valuation: 120,
      ticket_upload: 60,
      buy_credits: 25,
    },
    sourceUsers: new Map<string, Record<string, number>>([
      ["facebook / paid", { page_view_valuation: 20 }],
      ["google / cpc", { page_view_valuation: 100, ticket_upload: 50 }],
    ]),
    totalFunnel: new Map<string, Record<string, number>>([
      ["", { page_view_valuation: 100, ticket_upload: 50, buy_credits: 10 }],
    ]),
    sourceFunnel: new Map<string, Record<string, number>>([
      [
        "google / cpc",
        {
          page_view_valuation: 80,
          ticket_upload: 40,
          buy_credits: 0,
        },
      ],
    ]),
  });
  assertEquals(result.total.source, "סה״כ");
  assertEquals(result.total.stepRates, {
    page_view_valuation: null,
    ticket_upload: 0.5,
    buy_credits: 0.2,
  });
  assertEquals(
    result.sources.map((s) => s.source),
    ["google / cpc", "facebook / paid"],
  );
  assertEquals(result.sources[0].stepRates.buy_credits, 0);
  assertEquals(result.sources[1].stepRates.ticket_upload, null);
  assertEquals(result.funnelAvailable, true);
});

Deno.test(
  "without the funnel report the counts stay and the rates are empty",
  () => {
    const many = new Map<string, Record<string, number>>(
      Array.from({ length: TOP_SOURCES + 3 }, (_, i) => [
        `source ${i}`,
        { page_view_valuation: i },
      ]),
    );
    const result = buildEventUsers({
      steps: STEPS,
      totalUsers: { page_view_valuation: 10 },
      sourceUsers: many,
      totalFunnel: null,
      sourceFunnel: null,
    });
    assertEquals(result.funnelAvailable, false);
    assertEquals(result.sources.length, TOP_SOURCES);
    assertEquals(result.sources[0].source, `source ${TOP_SOURCES + 2}`);
    assertEquals(result.total.stepRates.ticket_upload, null);
  },
);
