import { readAdAccountId } from "./tool-contracts-admin.ts";
import {
  assertEquals,
  assertStrictEquals,
  assertThrows,
} from "jsr:@std/assert@1";
import {
  adAccountDisableReason,
  automationStepArg,
  parallelTaskArgs,
  providerErrorMessage,
  readGoogleAdsCampaignRow,
  readGoogleCalendarEvents,
} from "./tool-contracts-admin.ts";
import { successCriterionArgs } from "./goal-args.ts";
import {
  googleAdsCredentials,
  googleAdsRefreshToken,
} from "./google-ads-config.ts";
import { financeEntries, relationName } from "./tool-contracts-crm.ts";

Deno.test("ad account disable_reason is read from objects only", () => {
  assertStrictEquals(adAccountDisableReason({ id: "1", disable_reason: 3 }), 3);
  for (const value of [null, undefined, "x", 3]) {
    assertStrictEquals(adAccountDisableReason(value), undefined);
  }
});

Deno.test("provider error message mirrors optional chaining", () => {
  assertStrictEquals(
    providerErrorMessage({ error: { message: "denied", code: 403 } }),
    "denied",
  );
  for (const value of [{ error: "denied" }, {}, null, "x", [1]]) {
    assertStrictEquals(providerErrorMessage(value), undefined);
  }
});

Deno.test("Google Ads campaign rows keep leaves as sent", () => {
  const row = readGoogleAdsCampaignRow({
    campaign: { id: "12", name: "Brand", status: "ENABLED", x: 1 },
    campaignBudget: { amountMicros: "5000000" },
    metrics: { costMicros: "1000", clicks: "4" },
  });
  assertEquals<unknown>(row.campaign, {
    id: "12",
    name: "Brand",
    status: "ENABLED",
  });
  assertStrictEquals(row.campaignBudget.amountMicros, "5000000");
  assertStrictEquals(row.metrics.clicks, "4");
  assertStrictEquals(row.metrics.impressions, undefined);
});

Deno.test("malformed Google Ads campaign rows read as empty", () => {
  for (const value of [null, "row", { campaign: "x", metrics: [] }]) {
    const row = readGoogleAdsCampaignRow(value);
    assertStrictEquals(row.campaign.id, undefined);
    assertStrictEquals(row.campaignBudget.amountMicros, undefined);
    assertStrictEquals(row.metrics.costMicros, undefined);
  }
});

Deno.test(
  "Google Calendar events keep conference fields for the link reader",
  () => {
    const [event] = readGoogleCalendarEvents({
      items: [
        {
          id: "e1",
          summary: "Call",
          start: { dateTime: "2026-10-29T10:00:00+03:00" },
          end: { date: "2026-10-29" },
          attendees: [{ email: "a@b.co" }, "odd"],
          hangoutLink: "https://meet.google.com/abc",
        },
      ],
    });
    assertStrictEquals(event.id, "e1");
    assertStrictEquals(event.start.dateTime, "2026-10-29T10:00:00+03:00");
    assertStrictEquals(event.end.date, "2026-10-29");
    assertEquals<unknown>(event.attendees, [{ email: "a@b.co" }, {}]);
    assertStrictEquals(
      Reflect.get(event, "hangoutLink"),
      "https://meet.google.com/abc",
    );
  },
);

Deno.test(
  "Google Calendar payloads without an items array have no events",
  () => {
    for (const value of [null, {}, { items: "x" }, { error: { code: 401 } }]) {
      assertEquals<unknown>(readGoogleCalendarEvents(value), []);
    }
    const [event] = readGoogleCalendarEvents({ items: [null] });
    assertStrictEquals(event.start.dateTime, undefined);
    assertStrictEquals(event.attendees, undefined);
  },
);

Deno.test(
  "delegate_parallel keeps only entries with a truthy title and prompt",
  () => {
    const tasks: unknown[] = [
      { title: "a", prompt: "b", task_skills: ["x"], extra: 1 },
      { title: "", prompt: "b" },
      { title: "a" },
      null,
      "task",
      ["a", "b"],
    ];
    assertEquals<unknown>(parallelTaskArgs(tasks), [
      { title: "a", prompt: "b", task_skills: ["x"] },
    ]);
  },
);

Deno.test(
  "automation steps read LLM fields and still reject null entries",
  () => {
    assertEquals(
      automationStepArg({
        type: "agent",
        config: { message_template: "hello" },
      }),
      {
        type: "agent",
        config: { message_template: "hello" },
      },
    );
    assertThrows(() => automationStepArg("step"));
    assertThrows(() => automationStepArg(["agent"]));
    assertThrows(() => automationStepArg(null), TypeError);
    assertThrows(() => automationStepArg(undefined), TypeError);
  },
);

Deno.test("success criteria keep valid entries with their extra fields", () => {
  assertEquals<unknown>(
    successCriterionArgs([
      { description: "done", required: true, verification_config: { a: 1 } },
      { description: 3 },
      { key: "k" },
      "text",
    ]),
    [{ description: "done", required: true, verification_config: { a: 1 } }],
  );
  assertStrictEquals(successCriterionArgs(undefined), undefined);
  assertStrictEquals(successCriterionArgs({ description: "x" }), undefined);
});

Deno.test("embedded relation names and finance entries", () => {
  assertStrictEquals(relationName({ name: "Acme" }), "Acme");
  assertStrictEquals(relationName(null), undefined);
  assertEquals<unknown>(
    financeEntries([{ id: "f1", clients: { name: "Acme" } }, null, "x"]),
    [{ id: "f1", clients: { name: "Acme" }, client_name: "Acme" }],
  );
});

Deno.test(
  "Google Ads credentials prefer settings over additional_config",
  () => {
    assertEquals<unknown>(
      googleAdsCredentials({
        additional_config: { refresh_token: "old", mcc_id: "1-2" },
        settings: { refresh_token: "new" },
        api_key: "key",
      }),
      { refreshToken: "new", loginCustomerId: "1-2" },
    );
    assertEquals<unknown>(
      googleAdsCredentials({ api_key: "key", settings: "x" }),
      {
        refreshToken: "key",
        loginCustomerId: undefined,
      },
    );
    assertEquals<unknown>(googleAdsCredentials(null), {
      refreshToken: undefined,
      loginCustomerId: undefined,
    });
    assertStrictEquals(googleAdsRefreshToken({ refresh_token: "t" }), "t");
    assertStrictEquals(googleAdsRefreshToken(null), undefined);
  },
);

Deno.test(
  "Meta account identifiers accept strings and numeric legacy IDs",
  () => {
    assertStrictEquals(readAdAccountId("act_123"), "act_123");
    assertStrictEquals(readAdAccountId(123), 123);
    assertStrictEquals(readAdAccountId({ id: "123" }), undefined);
  },
);

Deno.test(
  "known provider fields reject object values instead of passing them downstream",
  () => {
    assertStrictEquals(
      providerErrorMessage({ error: { message: { bad: true } } }),
      undefined,
    );
    const campaign = readGoogleAdsCampaignRow({
      campaign: { id: { bad: true }, name: "valid" },
      metrics: { clicks: { bad: true } },
    });
    assertStrictEquals(campaign.campaign.id, undefined);
    assertStrictEquals(campaign.campaign.name, "valid");
    assertStrictEquals(campaign.metrics.clicks, undefined);
    assertEquals(
      parallelTaskArgs([{ title: { bad: true }, prompt: "work" }]),
      [],
    );
  },
);

Deno.test(
  "unsupported automation configuration is refused before approval",
  () => {
    assertThrows(() =>
      automationStepArg({
        type: "action",
        config: { arbitrary: { bad: true } },
      }),
    );
  },
);
