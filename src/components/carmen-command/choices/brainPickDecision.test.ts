import { describe, expect, it } from "vitest";
import {
  FALLBACK_BRAIN_ROUTES,
  type BrainRoute,
} from "@/lib/agentChannelRouting";
import { desiredRoute, isQuietChat, pickStep } from "./brainPickDecision";

const modelBrain: BrainRoute = {
  id: "route-gpt",
  slug: "gpt-fast",
  label: "GPT",
  route_type: "model",
  provider: "model",
};
const routes = [...FALLBACK_BRAIN_ROUTES, modelBrain];

describe("desiredRoute", () => {
  it("opens on the stored pick when the user may use it", () => {
    expect(desiredRoute(routes, "gpt-fast")).toBe(modelBrain);
    expect(desiredRoute(routes, "cursor")?.slug).toBe("cursor");
  });

  it("opens on Carmen's internal brain without a pick", () => {
    expect(desiredRoute(routes, null)?.slug).toBe("internal");
  });

  it("falls back to the internal brain when the pick is not in the user's list", () => {
    expect(desiredRoute(FALLBACK_BRAIN_ROUTES, "gpt-fast")?.slug).toBe(
      "internal",
    );
  });

  it("leaves the selection alone when neither is allowed", () => {
    const onlyCursor = routes.filter((route) => route.slug === "cursor");

    expect(desiredRoute(onlyCursor, "gpt-fast")).toBeUndefined();
    expect(desiredRoute([], null)).toBeUndefined();
  });
});

describe("isQuietChat", () => {
  const empty = {
    messageCount: 0,
    conversationId: null,
    streaming: false,
    liveVoice: false,
    voiceNote: false,
    channelStatus: "idle" as const,
  };

  it("is quiet with nothing in the chat and nothing running", () => {
    expect(isQuietChat(empty)).toBe(true);
  });

  it.each([
    ["a message on screen", { messageCount: 1 }],
    ["an open conversation", { conversationId: "conv-1" }],
    ["a reply streaming in", { streaming: true }],
    ["a live voice conversation", { liveVoice: true }],
    ["a voice note being recorded or transcribed", { voiceNote: true }],
    ["a brain at work", { channelStatus: "debating" as const }],
  ])("is not quiet with %s", (_name, activity) => {
    expect(isQuietChat({ ...empty, ...activity })).toBe(false);
  });
});

describe("pickStep", () => {
  const stored = { tenantId: "tenant-a", slug: "gpt-fast" };
  const following = {
    ready: true,
    settled: true,
    quiet: true,
    stored,
    followed: stored,
  };
  const ownPick = { tenantId: "tenant-a", ownPick: true as const };

  it("opens the chat on the pick once when the session opens", () => {
    expect(pickStep({ ...following, followed: null })).toBe("open");
    expect(pickStep(following)).toBe("wait");
  });

  it("waits until the brain list and the picks are known", () => {
    expect(pickStep({ ...following, followed: null, ready: false })).toBe(
      "wait",
    );
  });

  it("opens on a pick that changed, including back to no pick", () => {
    const followed = { tenantId: "tenant-a", slug: "cursor" };

    expect(pickStep({ ...following, followed })).toBe("open");
    expect(
      pickStep({ ...following, stored: { tenantId: "tenant-a", slug: null } }),
    ).toBe("open");
  });

  it("holds a changed pick while the chat has content or is running", () => {
    const followed = { tenantId: "tenant-a", slug: "cursor" };

    expect(pickStep({ ...following, followed, quiet: false })).toBe("wait");
  });

  it("returns to the pick after a reopened conversation, once the chat is empty", () => {
    expect(pickStep({ ...following, followed: null, quiet: false })).toBe(
      "wait",
    );
    expect(pickStep({ ...following, followed: null })).toBe("open");
  });

  it("opens again in another org even when the slug is the same", () => {
    const followed = { tenantId: "tenant-b", slug: "gpt-fast" };

    expect(pickStep({ ...following, followed })).toBe("open");
  });

  it("leaves a brain the user chose here alone while the picks are not settled", () => {
    const unsettled = { ...following, followed: ownPick, settled: false };

    expect(pickStep(unsettled)).toBe("wait");
    expect(
      pickStep({ ...unsettled, stored: { tenantId: "tenant-a", slug: null } }),
    ).toBe("wait");
  });

  it("follows the row after the user's own pick settled, without moving the chat", () => {
    expect(pickStep({ ...following, followed: ownPick })).toBe("follow");
    expect(pickStep({ ...following, followed: ownPick, quiet: false })).toBe(
      "follow",
    );
  });

  it("opens on the new org's pick when the org changed under the user's own pick", () => {
    const elsewhere = { tenantId: "tenant-b", ownPick: true as const };

    expect(pickStep({ ...following, followed: elsewhere })).toBe("open");
    expect(pickStep({ ...following, followed: elsewhere, quiet: false })).toBe(
      "wait",
    );
  });
});
