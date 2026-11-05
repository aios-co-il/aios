import { expect, test } from "vitest";
import { FALLBACK_BRAIN_ROUTES } from "./agentChannelRouting.ts";
import {
  conversationMatchesRoute,
  conversationsForRoute,
  filterMessagesForRoute,
  messageSpeakerKey,
  seatKeyFromRoute,
  topicAgentLabel,
  topicAgentSprite,
} from "./agentSeats.ts";

test("seat key maps parliament to shared and cursor to direct", () => {
  const parliament = FALLBACK_BRAIN_ROUTES.find(
    (r) => r.slug === "parliament",
  )!;
  const cursor = FALLBACK_BRAIN_ROUTES.find((r) => r.slug === "cursor")!;
  expect(seatKeyFromRoute(parliament)).toBe("shared");
  expect(seatKeyFromRoute(cursor)).toBe("cursor");
});

test("shared space shows all agent lines; direct hides other agents and their user lines", () => {
  const parliament = FALLBACK_BRAIN_ROUTES.find(
    (r) => r.slug === "parliament",
  )!;
  const cursor = FALLBACK_BRAIN_ROUTES.find((r) => r.slug === "cursor")!;
  const carmen = FALLBACK_BRAIN_ROUTES.find((r) => r.slug === "internal")!;
  const msgs = [
    { role: "user", content: "ask carmen", channel: "internal" },
    { role: "assistant", speaker: "carmen", channel: "internal", content: "c" },
    { role: "user", content: "ask cursor", channel: "cursor" },
    { role: "assistant", speaker: "cursor", channel: "cursor", content: "a" },
    { role: "assistant", speaker: "grok", channel: "grok", content: "b" },
  ];
  expect(filterMessagesForRoute(msgs, parliament).length).toBe(5);
  expect(filterMessagesForRoute(msgs, cursor).length).toBe(2);
  expect(
    filterMessagesForRoute(msgs, cursor).map((m) => m.content),
  ).toStrictEqual(["ask cursor", "a"]);
  expect(
    filterMessagesForRoute(msgs, carmen).map((m) => m.content),
  ).toStrictEqual(["ask carmen", "c"]);
  expect(messageSpeakerKey({ role: "assistant", speaker: "codex" })).toBe(
    "codex",
  );
});

test("topic rail picks agent sprite from brain_route_id", () => {
  const cursor = FALLBACK_BRAIN_ROUTES.find((r) => r.slug === "cursor")!;
  const internal = FALLBACK_BRAIN_ROUTES.find((r) => r.slug === "internal")!;
  const conv = { brain_route_id: cursor.id, routing_mode: "direct_channel" };
  expect(topicAgentSprite(conv, FALLBACK_BRAIN_ROUTES)).toMatch(/ghost-cursor/);
  expect(topicAgentLabel(conv, FALLBACK_BRAIN_ROUTES)).toBe("Cursor Direct");
  const carmenConv = { brain_route_id: internal.id, routing_mode: "internal" };
  expect(topicAgentSprite(carmenConv, FALLBACK_BRAIN_ROUTES)).toMatch(
    /^data:image\/webp;base64,/,
  );
});

test("untagged legacy user lines stay on Carmen, not Cursor Direct", () => {
  const cursor = FALLBACK_BRAIN_ROUTES.find((r) => r.slug === "cursor")!;
  const carmen = FALLBACK_BRAIN_ROUTES.find((r) => r.slug === "internal")!;
  const msgs = [
    { role: "user", content: "old carmen ask" },
    { role: "assistant", speaker: "carmen", content: "old reply" },
  ];
  expect(filterMessagesForRoute(msgs, cursor).length).toBe(0);
  expect(filterMessagesForRoute(msgs, carmen).length).toBe(2);
});

test("conversation list is scoped to the active seat", () => {
  const cursor = {
    ...FALLBACK_BRAIN_ROUTES.find((r) => r.slug === "cursor")!,
    id: "route-cursor",
  };
  const grok = {
    ...FALLBACK_BRAIN_ROUTES.find((r) => r.slug === "grok")!,
    id: "route-grok",
  };
  const carmen = FALLBACK_BRAIN_ROUTES.find((r) => r.slug === "internal")!;
  const parliament = FALLBACK_BRAIN_ROUTES.find(
    (r) => r.slug === "parliament",
  )!;
  const routes = [cursor, grok, carmen, parliament];
  const items = [
    {
      id: "1",
      updated_at: "2026-01-01",
      routing_mode: "direct_channel",
      brain_route_id: "route-cursor",
    },
    { id: "2", updated_at: "2026-01-02", routing_mode: "internal" },
    { id: "3", updated_at: "2026-01-03", routing_mode: "parliament" },
    { id: "4", updated_at: "2026-01-04" },
    {
      id: "5",
      updated_at: "2026-01-05",
      routing_mode: "direct_channel",
      brain_route_id: "route-grok",
    },
    { id: "6", updated_at: "2026-01-06", routing_mode: "direct_channel" },
  ];
  expect(
    conversationsForRoute(items, cursor, routes).map((c) => c.id),
  ).toStrictEqual(["1"]);
  expect(
    conversationsForRoute(items, grok, routes).map((c) => c.id),
  ).toStrictEqual(["5"]);
  expect(
    conversationsForRoute(items, carmen, routes).map((c) => c.id),
  ).toStrictEqual(["2", "4"]);
  expect(
    conversationsForRoute(items, parliament, routes).map((c) => c.id),
  ).toStrictEqual(["3"]);
  expect(
    conversationMatchesRoute(
      { routing_mode: "direct_channel" },
      cursor,
      routes,
    ),
  ).toBe(false);
});
