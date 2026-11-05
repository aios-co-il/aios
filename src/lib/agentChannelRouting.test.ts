import { expect, test } from "vitest";
import {
  FALLBACK_BRAIN_ROUTES,
  DEFAULT_BRAIN_SLUG,
  deriveParliamentView,
  groupLabel,
  isInputLocked,
  parliamentSeats,
  pickDefaultRoute,
  sendPathForRoute,
  speakerLabel,
  hudStage,
  slugForCouncilSeat,
  councilSeatFromSlug,
  routeForTableAddress,
  channelHealthBanner,
  billingNoteForRoute,
  initialSelectedRoute,
  routeForRestoredChat,
} from "./agentChannelRouting.ts";

test("selecting a direct channel changes the send path", () => {
  const internal = FALLBACK_BRAIN_ROUTES.find((r) => r.slug === "internal")!;
  const cursor = FALLBACK_BRAIN_ROUTES.find((r) => r.slug === "cursor")!;
  const parliament = FALLBACK_BRAIN_ROUTES.find(
    (r) => r.slug === "parliament",
  )!;
  expect(sendPathForRoute(internal)).toBe("internal_stream");
  expect(sendPathForRoute(cursor)).toBe("channel_gateway");
  expect(sendPathForRoute(parliament)).toBe("channel_gateway");
});

test("debate and waiting_external lock the composer", () => {
  expect(isInputLocked("idle")).toBe(false);
  expect(isInputLocked("debating")).toBe(true);
  expect(isInputLocked("waiting_external")).toBe(true);
});

test("speaker labels distinguish channels", () => {
  expect(speakerLabel("cursor")).toBe("Cursor");
  expect(speakerLabel("codex")).toBe("Codex");
  expect(speakerLabel("carmen", "internal")).toBe("כרמן");
  expect(groupLabel("direct_channel")).toBe("ערוץ ישיר");
});

test("default brain is Carmen Direct; first paint opens solo HUD not knights table", () => {
  expect(DEFAULT_BRAIN_SLUG).toBe("cursor");
  expect(pickDefaultRoute(FALLBACK_BRAIN_ROUTES).slug).toBe("cursor");
  expect(pickDefaultRoute(FALLBACK_BRAIN_ROUTES, "grok").slug).toBe("grok");
  expect(initialSelectedRoute("tenant-with-saved-parliament").slug).toBe(
    "cursor",
  );
  expect(hudStage({ routeType: initialSelectedRoute(null).route_type })).toBe(
    "direct",
  );
});

test("restored chat keeps its own brain; empty session stays on Carmen Direct", () => {
  const routes = FALLBACK_BRAIN_ROUTES;
  expect(
    routeForRestoredChat(routes, { routing_mode: "parliament" }).slug,
  ).toBe("parliament");
  expect(
    routeForRestoredChat(routes, {
      routing_mode: "direct_channel",
      brain_route_id: "fallback-cursor",
    }).slug,
  ).toBe("cursor");
  expect(routeForRestoredChat(routes, null).slug).toBe("cursor");
});

test("HUD is solo for Direct Chat tabs, table only for Knights Round Table", () => {
  expect(hudStage({ routeType: "direct_channel" })).toBe("direct");
  expect(hudStage({ routeType: "internal" })).toBe("direct");
  expect(hudStage({ routeType: "parliament" })).toBe("table");
  expect(hudStage({ debating: true })).toBe("table");
  expect(slugForCouncilSeat("carmen")).toBe("internal");
  expect(councilSeatFromSlug("internal")).toBe("carmen");
  expect(councilSeatFromSlug("parliament")).toBe(null);
});

test("table address picks a seat route without leaving parliament HUD", () => {
  const routes = FALLBACK_BRAIN_ROUTES;
  expect(routeForTableAddress(routes, null)?.slug).toBe("parliament");
  expect(routeForTableAddress(routes, "cursor")?.slug).toBe("cursor");
  expect(routeForTableAddress(routes, "carmen")?.slug).toBe("internal");
  expect(hudStage({ routeType: "parliament" })).toBe("table");
});

test("channel health banner only when Cursor key is rejected", () => {
  expect(channelHealthBanner(null)).toBe(null);
  expect(
    channelHealthBanner({ ok: true, cursor: { ok: true, status: 200 } }),
  ).toBe(null);
  expect(channelHealthBanner({ ok: false })).toBe(null);
  const banner = channelHealthBanner({
    ok: false,
    cursor: { ok: false, status: 401 },
  });
  expect(banner || "").toMatch(/CURSOR_API_KEY/);
  expect(banner || "").toMatch(/Staging/);
  expect(banner || "").toMatch(/כרמן הפנימית עובדת/);
});

test("health banner explains when Cursor Direct is unavailable", () => {
  const banner = channelHealthBanner({
    ok: true,
    cursor: { ok: true, status: 200 },
    seats: { cursor: { open_chat: false } },
  });
  expect(banner || "").toMatch(/CURSOR_API_KEY/);
});

test("route notes: Cursor uses Cloud; Codex uses ChatGPT Workspace", () => {
  expect(billingNoteForRoute("cursor") || "").toMatch(/סוכן Cursor חדש/);
  expect(billingNoteForRoute("codex") || "").toMatch(/ChatGPT Workspace/);
  expect(billingNoteForRoute("codex") || "").not.toMatch(/סוכן Cursor/);
});

test("parliament seats are Cursor + Grok + Codex", () => {
  const p = FALLBACK_BRAIN_ROUTES.find((r) => r.slug === "parliament")!;
  expect(parliamentSeats(p)).toStrictEqual(["cursor", "grok", "codex"]);
});

test("parliament view maps seat replies and advances to review round", () => {
  const p = FALLBACK_BRAIN_ROUTES.find((r) => r.slug === "parliament")!;
  const view = deriveParliamentView(
    [
      { role: "user", content: "איך לשחרר את הדופק?" },
      { role: "tool_call", tool: "פרלמנט נפתח — סבב 1", channel: "parliament" },
      {
        role: "assistant",
        speaker: "cursor",
        channel: "cursor",
        content: "תקן את ה-JID",
      },
      {
        role: "tool_call",
        tool: "סבב ביקורת — כל מושב מקבל את תשובות האחרים.",
      },
    ],
    p,
  );
  expect(view.round).toBe(2);
  expect(view.topic).toBe("איך לשחרר את הדופק?");
  const cursor = view.seats.find((s) => s.provider === "cursor")!;
  const grok = view.seats.find((s) => s.provider === "grok")!;
  expect(cursor.state).toBe("reviewing");
  expect(grok.state).toBe("waiting");
  expect(cursor.preview || "").toMatch(/JID/);
});
