import {
  assert,
  assertEquals,
  assertFalse,
  assertRejects,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing@1/bdd";
import { CallBudget } from "../_shared/reconcile/budget.ts";
import { ReconcileSourceError } from "../_shared/reconcile/errors.ts";
import { replay, sleepRecorder } from "../_shared/reconcile/test-fixtures.ts";
import type { ReconcileTable } from "../_shared/reconcile/types.ts";
import { createGoogleSource } from "./google-source.ts";

const googleTable: ReconcileTable = {
  id: "t-google",
  tenant_id: "tenant-1",
  client_id: "client-1",
  integration_type: "google_ads",
  integration_settings: { customer_id: "123-456-7890", manager_id: "999" },
};

const GOOGLE_AUTH = {
  accessToken: "ya29.recordedaccesstoken",
  developerToken: "dev-token",
  loginCustomerId: "999",
};

/** A campaign row of the GAQL answer for `date`. */
const searchRow = (date: string, metrics: Record<string, unknown>) => ({
  segments: { date },
  campaign: { id: "55", name: "Search | Brand" },
  metrics,
});

describe("createGoogleSource", () => {
  it("reads the customer time zone, queries segments.date and turns micros into currency", async () => {
    const rec = replay([
      {
        match: /searchStream/,
        body: [
          {
            results: [
              {
                customer: {
                  id: "1234567890",
                  descriptiveName: "Client",
                  currencyCode: "ILS",
                  timeZone: "Asia/Jerusalem",
                },
              },
            ],
          },
        ],
      },
      {
        match: /searchStream/,
        body: [
          {
            results: [
              searchRow("2026-10-20", {
                costMicros: "210500000",
                conversions: 7.5,
                conversionsValue: 0,
              }),
            ],
          },
          {
            results: [
              searchRow("2026-10-21", {
                costMicros: "1000000",
                conversions: 0,
              }),
            ],
          },
        ],
      },
    ]);
    const source = createGoogleSource({
      getAuth: () => Promise.resolve(GOOGLE_AUTH),
      budget: new CallBudget(10),
      fetch: rec.fetchFn,
      sleep: sleepRecorder().sleep,
    });
    const account = await source.account(googleTable);
    assertEquals(account, {
      account_id: "1234567890",
      name: "Client",
      currency: "ILS",
      timezone: "Asia/Jerusalem",
    });
    const { rows } = await source.campaignDays(
      googleTable,
      { start: "2026-10-19", end: "2026-10-25" },
      account,
    );
    const query = JSON.parse(String(rec.calls[1].init?.body)).query;
    assert(
      query.includes("segments.date BETWEEN '2026-10-19' AND '2026-10-25'"),
    );
    assert(query.includes("FROM campaign"));
    const headers = new Headers(rec.calls[1].init?.headers);
    assertStrictEquals(headers.get("login-customer-id"), "999");
    assertEquals(
      rows.map((r) => [r.date, r.campaign_id, r.data.cost, r.data.conversions]),
      [
        ["2026-10-20", "55", 210.5, 7.5],
        ["2026-10-21", "55", 1, 0],
      ],
    );
  });

  it("retries RESOURCE_EXHAUSTED and treats UNAUTHENTICATED as auth", async () => {
    const { sleep, sleeps } = sleepRecorder();
    const rec = replay([
      {
        match: /searchStream/,
        status: 429,
        body: [{ error: { status: "RESOURCE_EXHAUSTED", message: "quota" } }],
      },
      {
        match: /searchStream/,
        body: [
          { results: [{ customer: { timeZone: "UTC", currencyCode: "USD" } }] },
        ],
      },
    ]);
    const source = createGoogleSource({
      getAuth: () => Promise.resolve(GOOGLE_AUTH),
      budget: new CallBudget(10),
      fetch: rec.fetchFn,
      sleep,
    });
    const account = await source.account(googleTable);
    assertStrictEquals(account.currency, "USD");
    assertEquals(sleeps, [2000]);

    const denied = replay([
      {
        match: /searchStream/,
        status: 401,
        body: {
          error: {
            status: "UNAUTHENTICATED",
            message:
              "Request had invalid authentication credentials. Bearer ya29.recordedaccesstoken",
          },
        },
      },
    ]);
    const deniedSource = createGoogleSource({
      getAuth: () => Promise.resolve(GOOGLE_AUTH),
      budget: new CallBudget(10),
      fetch: denied.fetchFn,
      sleep,
    });
    const err = await assertRejects(
      () => deniedSource.account(googleTable),
      ReconcileSourceError,
    );
    assertStrictEquals(err.kind, "auth");
    assertFalse(err.message.includes("ya29.recorded"));
  });
});
