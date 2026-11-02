import { assert, assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { toPublicCachedShareBody } from "./cached-share-body.ts";

/** Stored settings: display choices next to credentials and a sync error. */
function storedSettings(): Record<string, unknown> {
  return {
    webhook_secret: "SECRET-webhook-1",
    access_token: "SECRET-access-3",
    refresh_token: "SECRET-refresh-4",
    api_key: "SECRET-apikey-5",
    credentials: { private_key: "SECRET-private-16" },
    campaign_type: "ecommerce",
    currency: "USD",
    manual_roi: { closures: 4, revenue: 12000, note: "SECRET-roi-19" },
    last_sync_outcome: {
      status: "failed",
      error: "401 invalid token SECRET-err-20",
    },
  };
}

/** Every planted credential value contains "SECRET"; none may survive. */
function assertNoSecrets(output: string) {
  assert(!output.includes("SECRET"), `leaked a credential: ${output}`);
  for (const key of [
    "webhook_secret",
    "access_token",
    "refresh_token",
    "api_key",
    "credentials",
    "last_sync_outcome",
  ]) {
    assert(!output.includes(`"${key}"`), `leaked key ${key}`);
  }
}

Deno.test("a body cached before the allowlist goes out filtered", () => {
  const cached = JSON.stringify({
    table: {
      id: "t1",
      name: "SEO",
      integration_type: "ahrefs",
      integration_settings: storedSettings(),
    },
    ga_table: { id: "ga", name: "GA", integration_settings: storedSettings() },
    gsc_table: {
      id: "gsc",
      name: "GSC",
      integration_settings: storedSettings(),
    },
    ahrefs_reports: [{ id: "r1", domain: "example.co.il" }],
  });
  const body = toPublicCachedShareBody(cached);
  assert(body);
  assertNoSecrets(body);
  const payload = JSON.parse(body);
  assertEquals(payload.table.integration_settings.currency, "USD");
  assertEquals(
    payload.ga_table.integration_settings.campaign_type,
    "ecommerce",
  );
  assertEquals(payload.gsc_table.name, "GSC");
  assertEquals(payload.ahrefs_reports, [{ id: "r1", domain: "example.co.il" }]);
});

Deno.test("the live table settings replace the cached ones, filtered", () => {
  const cached = JSON.stringify({
    table: { id: "t1", integration_settings: { shared_tabs: { gsc: true } } },
  });
  const body = toPublicCachedShareBody(cached, {
    ...storedSettings(),
    shared_tabs: { gsc: false },
  });
  assert(body);
  assertNoSecrets(body);
  assertEquals(JSON.parse(body).table.integration_settings.shared_tabs, {
    gsc: false,
  });
});

Deno.test("a GSC-only cached body passes through unchanged", () => {
  const cached = JSON.stringify({
    gsc_records: [{ id: "1", data: { query: "q" } }],
    gsc_multi_period: null,
    gsc_synced_at: "2026-10-26T00:00:00Z",
  });
  assertStrictEquals(toPublicCachedShareBody(cached), cached);
});

Deno.test("an unreadable cached body is treated as a cache miss", () => {
  assertStrictEquals(toPublicCachedShareBody("{not json"), null);
  assertStrictEquals(toPublicCachedShareBody("[1,2]"), null);
  assertStrictEquals(toPublicCachedShareBody("null"), null);
});

// The tests above pass even if the handler stops calling the helper, so this
// reads the handler. It finds the cached body only through
// `const <name> = await readSeoShareCache(`.
Deno.test(
  "public-table filters a cached share body before sending it",
  async () => {
    const source = await Deno.readTextFile(
      new URL("./index.ts", import.meta.url),
    );
    const cached = source.match(
      /const\s+(\w+)\s*=\s*await\s+readSeoShareCache\(/,
    )?.[1];
    assert(cached, "public-table no longer reads the share cache this way");
    assert(
      new RegExp(`toPublicCachedShareBody\\(\\s*${cached}\\b`).test(source),
      "the cached body skips toPublicCachedShareBody",
    );
    assert(
      !new RegExp(`new Response\\(\\s*${cached}\\b`).test(source),
      "the cached body is sent as stored",
    );
  },
);
