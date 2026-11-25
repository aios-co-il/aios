import { assert, assertEquals } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing/bdd";
import { handleAdPreview } from "./handler.ts";
import {
  AD_ID,
  graphPreview,
  OTHER_TABLE_ID,
  PREVIEW_SRC,
  setup,
  SHARE_TOKEN,
  TABLE_ID,
  TOKEN,
} from "./handler.test-fixture.ts";

describe("handleAdPreview", () => {
  it("returns the preview address to a signed-in viewer of the table", async () => {
    const { deps, graphCalls } = setup();

    const reply = await handleAdPreview(
      { table_id: TABLE_ID, ad_id: AD_ID },
      deps,
    );

    assertEquals(reply, { status: 200, body: { src: PREVIEW_SRC } });
    assertEquals(graphCalls, [
      {
        url: `https://graph.facebook.com/v21.0/${AD_ID}/previews?ad_format=MOBILE_FEED_STANDARD`,
        authorization: `Bearer ${TOKEN}`,
      },
    ]);
  });

  it("returns the preview address through an active share link", async () => {
    const { deps } = setup();

    const reply = await handleAdPreview(
      { share_token: SHARE_TOKEN, ad_id: AD_ID },
      deps,
    );

    assertEquals(reply, { status: 200, body: { src: PREVIEW_SRC } });
  });

  it("refuses a table the caller may not read, without calling Meta", async () => {
    const { deps, graphCalls } = setup();

    const reply = await handleAdPreview(
      { table_id: OTHER_TABLE_ID, ad_id: AD_ID },
      deps,
    );

    assertEquals(reply, { status: 404, body: { error: "not_found" } });
    assertEquals(graphCalls, []);
  });

  it("refuses an inactive share link", async () => {
    const { deps, graphCalls } = setup({ shareActive: false });

    const reply = await handleAdPreview(
      { share_token: SHARE_TOKEN, ad_id: AD_ID },
      deps,
    );

    assertEquals(reply, { status: 404, body: { error: "not_found" } });
    assertEquals(graphCalls, []);
  });

  it("refuses an ad that is not one of the table's ad rows", async () => {
    const { deps, graphCalls } = setup();

    const reply = await handleAdPreview(
      { share_token: SHARE_TOKEN, ad_id: "999" },
      deps,
    );

    assertEquals(reply, { status: 404, body: { error: "not_found" } });
    assertEquals(graphCalls, []);
  });

  it("refuses a table that is not a Facebook report", async () => {
    const { deps } = setup({ integrationType: "google_ads" });

    const reply = await handleAdPreview(
      { table_id: TABLE_ID, ad_id: AD_ID },
      deps,
    );

    assertEquals(reply, { status: 404, body: { error: "not_found" } });
  });

  it("rejects a malformed body before any lookup", async () => {
    const { deps } = setup();

    for (const body of [
      null,
      { table_id: TABLE_ID },
      { table_id: TABLE_ID, ad_id: "1/../me" },
      { table_id: "not-a-uuid", ad_id: AD_ID },
      { share_token: "short", ad_id: AD_ID },
    ]) {
      const reply = await handleAdPreview(body, deps);
      assertEquals(reply, { status: 400, body: { error: "invalid_request" } });
    }
  });

  it("accepts Meta's preview page on business.facebook.com", async () => {
    const src =
      "https://business.facebook.com/ads/api/preview_iframe.php?d=AQ1&t=AQ2";
    const { deps } = setup({
      graph: { status: 200, body: graphPreview(src) },
    });

    const reply = await handleAdPreview(
      { table_id: TABLE_ID, ad_id: AD_ID },
      deps,
    );

    assertEquals(reply, { status: 200, body: { src } });
  });

  it("refuses an iframe that does not frame Meta's preview page", async () => {
    for (const src of [
      "https://evil.example/ads/api/preview_iframe.php?d=1",
      "http://www.facebook.com/ads/api/preview_iframe.php?d=1",
      "https://www.facebook.com/login.php?next=1",
      "https://business.facebook.com.evil.example/ads/api/preview_iframe.php",
      "https://evil.facebook.com/ads/api/preview_iframe.php?d=1",
      "javascript:alert(1)",
    ]) {
      const { deps } = setup({
        graph: { status: 200, body: graphPreview(src) },
      });

      const reply = await handleAdPreview(
        { table_id: TABLE_ID, ad_id: AD_ID },
        deps,
      );

      assertEquals(reply, {
        status: 502,
        body: { error: "preview_unavailable" },
      });
    }
  });

  it("answers generically and logs no token when Meta fails", async () => {
    const { deps } = setup({
      graph: {
        status: 400,
        body: { error: { message: `Invalid token access_token=${TOKEN}` } },
      },
    });
    const logged: Array<string> = [];
    const original = console.error;
    console.error = (...args: Array<unknown>) => logged.push(args.join(" "));

    try {
      const reply = await handleAdPreview(
        { table_id: TABLE_ID, ad_id: AD_ID },
        deps,
      );

      assertEquals(reply, {
        status: 502,
        body: { error: "preview_unavailable" },
      });
    } finally {
      console.error = original;
    }
    assert(logged.length > 0);
    assert(logged.every((line) => !line.includes(TOKEN)));
  });

  it("answers generically when the table has no Meta connection", async () => {
    const { deps, graphCalls } = setup({ token: null });

    const reply = await handleAdPreview(
      { table_id: TABLE_ID, ad_id: AD_ID },
      deps,
    );

    assertEquals(reply, {
      status: 502,
      body: { error: "preview_unavailable" },
    });
    assertEquals(graphCalls, []);
  });
});
