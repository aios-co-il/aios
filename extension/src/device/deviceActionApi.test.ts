import { describe, expect, it, vi } from "vitest";
import { completeBody } from "./completion.ts";
import { deviceActionApi } from "./deviceActionApi.ts";

const ID = "0b5e8f7a-3c1d-4e2f-9a8b-7c6d5e4f3a2b";
const ENDPOINT = "https://api.example/functions/v1/carmen-device-action";
const CANCELLED = completeBody(ID, {
  status: "cancelled",
  decision: "ask",
  observed: null,
});

/** The API over a fake fetch that answers `status` with `body`. */
function apiAnswering(
  status: number,
  body: unknown,
  token: string | null = "user-token",
) {
  const fetch = vi.fn(
    async () => new Response(JSON.stringify(body), { status }),
  );
  const api = deviceActionApi({
    supabaseUrl: "https://api.example",
    publishableKey: "publishable",
    accessToken: async () => token,
    fetch,
  });

  return { api, fetch };
}

describe("deviceActionApi", () => {
  it("claims with the user's session and returns the tool", async () => {
    const { api, fetch } = apiAnswering(200, {
      tool: "browser_read_page",
      arguments: {},
    });

    expect(await api.claim(ID)).toEqual({
      ok: true,
      tool: "browser_read_page",
      arguments: {},
      trustedOrigin: null,
      conversationId: null,
    });
    expect(fetch).toHaveBeenCalledWith(
      ENDPOINT,
      expect.objectContaining({
        method: "POST",
        keepalive: false,
        body: JSON.stringify({ action: "claim", id: ID }),
        headers: expect.objectContaining({
          Authorization: "Bearer user-token",
          apikey: "publishable",
        }),
      }),
    );
  });

  it("hands a navigation's claimed arguments over unread, for the flow to check", async () => {
    const { api } = apiAnswering(200, {
      tool: "browser_navigate",
      arguments: { url: "https://shop.example/" },
    });

    expect(await api.claim(ID)).toEqual({
      ok: true,
      tool: "browser_navigate",
      arguments: { url: "https://shop.example/" },
      trustedOrigin: null,
      conversationId: null,
    });
  });

  it("passes on the claim's trust, and reads anything but a string as none", async () => {
    const trusted = apiAnswering(200, {
      tool: "browser_click",
      arguments: {},
      trusted_origin: "https://shop.example",
      conversation_id: "conversation-1",
    });
    const malformed = apiAnswering(200, {
      tool: "browser_click",
      arguments: {},
      trusted_origin: ["https://shop.example"],
      conversation_id: 7,
    });

    expect(await trusted.api.claim(ID)).toMatchObject({
      trustedOrigin: "https://shop.example",
      conversationId: "conversation-1",
    });
    expect(await malformed.api.claim(ID)).toMatchObject({
      trustedOrigin: null,
      conversationId: null,
    });
  });

  it("answers a refused claim, a missing session and a network failure without throwing", async () => {
    expect(
      (await apiAnswering(404, { error: "not_available" }).api.claim(ID)).ok,
    ).toBe(false);
    expect((await apiAnswering(200, {}, null).api.claim(ID)).ok).toBe(false);

    const failing = deviceActionApi({
      supabaseUrl: "https://api.example",
      publishableKey: "publishable",
      accessToken: async () => "user-token",
      fetch: vi.fn(async () => Promise.reject(new Error("offline"))),
    });
    expect((await failing.claim(ID)).ok).toBe(false);
  });

  it("refuses a claim whose tool is not a device tool", async () => {
    const { api } = apiAnswering(200, { tool: "send_whatsapp" });

    expect((await api.claim(ID)).ok).toBe(false);
  });

  it("retries a completion once after a network failure or a server error, never after a refusal", async () => {
    const flaky = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(new Response("{}", { status: 503 }));
    const api = deviceActionApi({
      supabaseUrl: "https://api.example",
      publishableKey: "publishable",
      accessToken: async () => "user-token",
      fetch: flaky,
    });
    await expect(api.complete(CANCELLED)).rejects.toThrow("503");
    expect(flaky).toHaveBeenCalledTimes(2);

    const recovering = apiAnswering(200, {});
    recovering.fetch.mockResolvedValueOnce(new Response("{}", { status: 502 }));
    await recovering.api.complete(CANCELLED);
    expect(recovering.fetch).toHaveBeenCalledTimes(2);

    const refused = apiAnswering(404, { error: "not_found" });
    await expect(refused.api.complete(CANCELLED)).rejects.toThrow("404");
    expect(refused.fetch).toHaveBeenCalledTimes(1);
  });

  it("sends the report fields at the top level and rejects an answer that is not ok", async () => {
    const { api, fetch } = apiAnswering(400, { error: "invalid_result" });

    await expect(api.complete(CANCELLED)).rejects.toThrow("400");
    expect(fetch).toHaveBeenCalledWith(
      ENDPOINT,
      expect.objectContaining({ body: JSON.stringify(CANCELLED) }),
    );
  });

  it("sends a closing completion at once, with keepalive and the last token used", async () => {
    const { api, fetch } = apiAnswering(200, { tool: "browser_read_page" });
    await api.claim(ID);
    fetch.mockClear();

    api.completeOnClose(CANCELLED);

    expect(fetch).toHaveBeenCalledWith(
      ENDPOINT,
      expect.objectContaining({
        keepalive: true,
        headers: expect.objectContaining({
          Authorization: "Bearer user-token",
        }),
      }),
    );
  });
});
