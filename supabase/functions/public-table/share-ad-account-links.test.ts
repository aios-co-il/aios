import { assertEquals } from "jsr:@std/assert@1";
import type { AdAccountTable } from "../_shared/share-links/ad-account-url.ts";
import {
  type ShareAdAccountReads,
  shareTableAdAccountLinks,
} from "./share-ad-account-links.ts";

const CLIENT_ID = "11111111-2222-3333-4444-555555555555";

const GOOGLE_URL = "https://ads.google.com/aw/overview?__e=1234567890";

/** Reads that answer from fixed rows and record which client they read. */
function fakeReads(
  clientLinks: Awaited<ReturnType<ShareAdAccountReads["clientLinks"]>>,
  clientAdTables: Array<AdAccountTable> = [],
) {
  const calls: Array<string> = [];
  const reads: ShareAdAccountReads = {
    clientLinks(clientId) {
      calls.push(`links:${clientId}`);
      return Promise.resolve(clientLinks);
    },
    clientAdTables(clientId) {
      calls.push(`tables:${clientId}`);
      return Promise.resolve(clientAdTables);
    },
  };
  return { reads, calls };
}

Deno.test(
  "an ads table links its own account and skips the client's tables",
  async () => {
    const { reads, calls } = fakeReads(null);

    const links = await shareTableAdAccountLinks(
      {
        client_id: CLIENT_ID,
        integration_type: "google_ads",
        integration_settings: {
          customer_id: "123-456-7890",
          refresh_token: "SECRET",
        },
      },
      reads,
    );

    assertEquals(links, [
      { url: GOOGLE_URL, platform: "google", label: "פתח חשבון מודעות" },
    ]);
    assertEquals(calls, [`links:${CLIENT_ID}`]);
  },
);

Deno.test("the client's saved link wins", async () => {
  const saved = "https://business.facebook.com/adsmanager?act=9";
  const { reads } = fakeReads({ meta_ads_url: saved });

  const links = await shareTableAdAccountLinks(
    {
      client_id: CLIENT_ID,
      integration_type: "facebook_insights",
      integration_settings: { ad_account_id: "act_111" },
    },
    reads,
  );

  assertEquals(links, [
    { url: saved, platform: "meta", label: "פתח חשבון מודעות" },
  ]);
});

Deno.test(
  "a non-ads table links the client's ads tables, legacy clientId included",
  async () => {
    const { reads, calls } = fakeReads(
      { google_ads_url: "https://attacker.example/aw" },
      [
        {
          integration_type: "google_ads",
          integration_settings: { customer_id: "1234567890" },
        },
      ],
    );

    const links = await shareTableAdAccountLinks(
      {
        integration_type: "google_analytics",
        integration_settings: { clientId: CLIENT_ID },
      },
      reads,
    );

    assertEquals(links, [
      { url: GOOGLE_URL, platform: "google", label: "חשבון Google Ads" },
    ]);
    assertEquals(calls, [`links:${CLIENT_ID}`, `tables:${CLIENT_ID}`]);
  },
);

Deno.test(
  "no client, or a client id that is not a uuid, reads nothing",
  async () => {
    const { reads, calls } = fakeReads(null);

    const links = await shareTableAdAccountLinks(
      {
        integration_type: "google_analytics",
        integration_settings: { clientId: "x,client_id.neq.0" },
      },
      reads,
    );

    assertEquals(links, []);
    assertEquals(calls, []);
  },
);

Deno.test(
  "a failed read shows no button instead of failing the share",
  async () => {
    const reads: ShareAdAccountReads = {
      clientLinks: () => Promise.reject(new Error("network")),
      clientAdTables: () => Promise.resolve([]),
    };

    const links = await shareTableAdAccountLinks(
      { client_id: CLIENT_ID, integration_type: "google_analytics" },
      reads,
    );

    assertEquals(links, []);
  },
);
