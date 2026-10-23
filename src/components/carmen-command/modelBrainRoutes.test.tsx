import { describe, expect, it } from "vitest";
import {
  FALLBACK_BRAIN_ROUTES,
  rememberRouteLabels,
  speakerLabel,
  type BrainRoute,
} from "@/lib/agentChannelRouting";
import {
  conversationMatchesRoute,
  filterMessagesForRoute,
} from "@/lib/agentSeats";
import { seatSelectOptions } from "./AgentSeatRail";

const gpt: BrainRoute = {
  id: "r-gpt",
  slug: "gpt-copy",
  label: "GPT קופי",
  route_type: "model",
  provider: "model",
  config: { color: "#ff0000" },
};
const gemini: BrainRoute = {
  id: "r-gem",
  slug: "gemini",
  label: "Gemini",
  route_type: "model",
  provider: "model",
};

describe("model brains", () => {
  it("each model brain keeps its own thread", () => {
    const msgs = [
      { role: "user", content: "to gpt", channel: "gpt-copy" },
      { role: "assistant", content: "gpt answer", speaker: "gpt-copy" },
      { role: "user", content: "to gemini", channel: "gemini" },
    ];
    expect(filterMessagesForRoute(msgs, gpt).map((m) => m.content)).toEqual([
      "to gpt",
      "gpt answer",
    ]);
    expect(filterMessagesForRoute(msgs, gemini)).toHaveLength(1);
    expect(
      conversationMatchesRoute(
        { brain_route_id: null, routing_mode: "model" },
        gpt,
      ),
    ).toBe(false);
  });

  it("the header select lists every active brain the rail does not cover", () => {
    const routes = [...FALLBACK_BRAIN_ROUTES, gpt, gemini];
    const { seats, extras } = seatSelectOptions(routes);
    expect(seats).toContain("cursor");
    expect(extras.map((r) => r.slug)).toEqual([
      "chatgpt",
      "gpt-copy",
      "gemini",
    ]);
  });

  it("a hidden built-in brain drops out of the select", () => {
    const routes = FALLBACK_BRAIN_ROUTES.filter((r) => r.slug !== "grok");
    expect(seatSelectOptions(routes).seats).not.toContain("grok");
  });

  it("replies show the brain's name", () => {
    rememberRouteLabels([gpt]);
    expect(speakerLabel("gpt-copy")).toBe("GPT קופי");
    expect(speakerLabel("cursor")).toBe("Cursor");
  });
});
