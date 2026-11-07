import { assertEquals } from "jsr:@std/assert@1";
import { fakeJwt } from "../_shared/auth/jwt-test-fixtures.ts";
import { isServiceCaller, parseRoundRequest } from "./request.ts";

const TENANT = "11111111-1111-4111-8111-111111111111";
const CLIENT = "22222222-2222-4222-8222-222222222222";

Deno.test("isServiceCaller accepts only the service role", () => {
  const req = (auth?: string) =>
    new Request("http://x", {
      method: "POST",
      headers: auth ? { Authorization: auth } : {},
    });
  const keys = ["service-key", "sb_secret_staging"];
  assertEquals(isServiceCaller(req("Bearer service-key"), keys), true);
  assertEquals(isServiceCaller(req("bearer service-key"), keys), true);
  // Staging's cron sends a new secret key from Vault (AIO-503).
  assertEquals(isServiceCaller(req("Bearer sb_secret_staging"), keys), true);
  assertEquals(isServiceCaller(req("Bearer user-jwt"), keys), false);
  // The cron sends Vault's service-role JWT, not the env key (AIO-503).
  const vaultJwt = fakeJwt({ role: "service_role", iss: "supabase" });
  assertEquals(isServiceCaller(req(`Bearer ${vaultJwt}`), keys), true);
  const userJwt = fakeJwt({ role: "authenticated", sub: "u1" });
  assertEquals(isServiceCaller(req(`Bearer ${userJwt}`), keys), false);
  assertEquals(isServiceCaller(req(), keys), false);
  assertEquals(isServiceCaller(req("Bearer "), []), false);
});

Deno.test("parseRoundRequest", async (t) => {
  await t.step("an empty body is a full scheduled run", () => {
    assertEquals(parseRoundRequest({}, undefined), {
      ok: true,
      request: {
        tenantId: null,
        clientId: null,
        collectorIds: null,
        dryRun: false,
        fixtures: null,
        now: null,
      },
    });
  });

  await t.step("a manual run for one client and named collectors", () => {
    const parsed = parseRoundRequest(
      {
        tenant_id: TENANT,
        client_id: CLIENT,
        collectors: ["self_test"],
        dry_run: true,
      },
      undefined,
    );
    assertEquals(parsed.ok && parsed.request, {
      tenantId: TENANT,
      clientId: CLIENT,
      collectorIds: ["self_test"],
      dryRun: true,
      fixtures: null,
      now: null,
    });
  });

  await t.step("bad ids and a client without its tenant are refused", () => {
    assertEquals(parseRoundRequest({ tenant_id: "x" }, undefined), {
      ok: false,
      status: 400,
      error: "invalid_id",
    });
    assertEquals(parseRoundRequest({ client_id: CLIENT }, undefined), {
      ok: false,
      status: 400,
      error: "client_id_needs_tenant_id",
    });
    assertEquals(parseRoundRequest({ collectors: [1] }, undefined), {
      ok: false,
      status: 400,
      error: "invalid_collectors",
    });
  });

  await t.step(
    "fixtures are refused in Production (APP_ENV unset counts) and force a dry run elsewhere",
    () => {
      const fixtures = { self_test: [], now: "2026-11-01T06:05:00Z" };
      assertEquals(parseRoundRequest({ fixtures }, undefined), {
        ok: false,
        status: 403,
        error: "fixtures_refused",
      });
      assertEquals(parseRoundRequest({ fixtures }, "production"), {
        ok: false,
        status: 403,
        error: "fixtures_refused",
      });
      const parsed = parseRoundRequest({ fixtures, dry_run: false }, "staging");
      assertEquals(
        parsed.ok && [parsed.request.dryRun, parsed.request.now?.toISOString()],
        [true, "2026-11-01T06:05:00.000Z"],
      );
    },
  );
});
