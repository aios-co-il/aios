import { assertEquals } from "jsr:@std/assert@1";
import { isServiceCaller, parseRoundRequest } from "./request.ts";

const TENANT = "11111111-1111-4111-8111-111111111111";
const CLIENT = "22222222-2222-4222-8222-222222222222";

Deno.test("isServiceCaller accepts only the service-role key", () => {
  const req = (auth?: string) =>
    new Request("http://x", {
      method: "POST",
      headers: auth ? { Authorization: auth } : {},
    });
  assertEquals(isServiceCaller(req("Bearer service-key"), "service-key"), true);
  assertEquals(isServiceCaller(req("bearer service-key"), "service-key"), true);
  assertEquals(isServiceCaller(req("Bearer user-jwt"), "service-key"), false);
  assertEquals(isServiceCaller(req(), "service-key"), false);
  assertEquals(isServiceCaller(req("Bearer "), ""), false);
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
