import {
  conferenceKindFromUrl,
  extractConferenceUrl,
} from "../_shared/calendar-conference.ts";
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
  assertEquals(row.campaign, { id: "12", name: "Brand", status: "ENABLED" });
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
    assertEquals(event.attendees, [{ email: "a@b.co" }, {}]);
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
      assertEquals(readGoogleCalendarEvents(value), []);
    }
    const [event] = readGoogleCalendarEvents({ items: [null] });
    assertStrictEquals(event.start.dateTime, undefined);
    assertStrictEquals(event.attendees, undefined);
  },
);

Deno.test(
  "delegate_parallel keeps only entries with a truthy title and prompt",
  () => {
    const tasks: Array<unknown> = [
      { title: "a", prompt: "b", task_skills: ["x"], extra: 1 },
      { title: "", prompt: "b" },
      { title: "a" },
      null,
      "task",
      ["a", "b"],
    ];
    assertEquals(parallelTaskArgs(tasks), [
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

Deno.test(
  "parsed calendar events prefer video over an earlier phone entry",
  () => {
    const [event] = readGoogleCalendarEvents({
      items: [
        {
          conferenceData: {
            entryPoints: [
              { entryPointType: "phone", uri: "tel:+123456789" },
              {
                entryPointType: "video",
                uri: "https://meet.google.com/abc-defg-hij",
              },
            ],
          },
        },
      ],
    });
    const url = extractConferenceUrl(event);
    assertStrictEquals(url, "https://meet.google.com/abc-defg-hij");
    assertStrictEquals(conferenceKindFromUrl(url), "meet");
  },
);

Deno.test(
  "automation validation errors identify the rejected field concisely",
  () => {
    const error = assertThrows(
      () => automationStepArg({ config: { delay_value: "bad" } }),
      Error,
      "Invalid automation step: config.delay_value:",
    );
    assertStrictEquals(error.message.includes("\n"), false);
  },
);
