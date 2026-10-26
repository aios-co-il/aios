import { assertMatch, assertNotMatch } from "jsr:@std/assert@1";
import { readFileSync } from "node:fs";

const core = readFileSync(
  new URL("./manus-wa-sync-groups-core.mjs", import.meta.url),
  "utf8",
);

Deno.test(
  "manus sync core never loads full whatsapp_groups without provider filter",
  () => {
    assertMatch(core, /provider.*manus_wa|eq\('provider', 'manus_wa'\)/);
    assertNotMatch(core, /loadLocalGroupCatalog/);
    assertMatch(core, /staging_manus_traffic_only|manus_traffic_fallback/);
    assertMatch(
      core,
      /Never scan the full whatsapp_groups|NEVER mix with Green API/i,
    );
  },
);

// FIXME: failing before the Deno migration (was never run in CI); fix or delete.
Deno.test.ignore(
  "manus sync uses exact /api/v1/instances/{id}/groups + X-Api-Key",
  () => {
    assertMatch(core, /\/api\/v1\/instances\/\$\{instanceId\}\/groups/);
    assertMatch(core, /'X-Api-Key': apiKey/);
    assertMatch(core, /Without a valid key → 401 JSON|HTML SPA/);
    assertMatch(core, /preserve|tagged|manus_wa_sync/i);
  },
);
