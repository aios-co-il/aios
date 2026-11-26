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
