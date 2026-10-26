import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import {
  authorizeSecretOrServiceRole,
  bearerFrom,
  isServiceRoleRequest,
  jwtRole,
  trustedInternalCron,
} from "./edge-caller-auth.ts";
import {
  ANON_KEY,
  FOREIGN_SERVICE_KEY,
  SERVICE,
  tokenOf,
} from "./ad-tools-test-fixtures.ts";

const bearer = (t: string) => `Bearer ${t}`;
const USER_JWT = tokenOf("ownerA");

Deno.test("bearerFrom and jwtRole", () => {
  assertStrictEquals(bearerFrom("Bearer abc "), "abc");
  assertStrictEquals(bearerFrom("bearer abc"), "abc");
  assertStrictEquals(bearerFrom("Basic abc"), null);
  assertStrictEquals(bearerFrom(null), null);
  assertStrictEquals(jwtRole(ANON_KEY), "anon");
  assertStrictEquals(jwtRole(USER_JWT), "authenticated");
  assertStrictEquals(jwtRole("shared-secret"), null);
  assertStrictEquals(jwtRole("a.%%%.c"), null);
});

Deno.test("isServiceRoleRequest needs the exact non-empty key", () => {
  assertStrictEquals(isServiceRoleRequest(bearer(SERVICE), SERVICE), true);
  assertStrictEquals(isServiceRoleRequest(bearer(SERVICE), ""), false);
  assertStrictEquals(isServiceRoleRequest(bearer(""), ""), false);
  assertStrictEquals(isServiceRoleRequest(SERVICE, SERVICE), false);
});

// sync-facebook-ecommerce: who may skip user auth with _internal_cron.
Deno.test(
  "sync-facebook-ecommerce: _internal_cron only from service role",
  () => {
    const cron = { table_id: "t", _internal_cron: true };
    assertStrictEquals(
      trustedInternalCron(cron, bearer(SERVICE), SERVICE),
      true,
    );
    // Ignored for everyone else: they fall through to user auth.
    for (const token of [ANON_KEY, USER_JWT, FOREIGN_SERVICE_KEY, "x"])
      assertStrictEquals(
        trustedInternalCron(cron, bearer(token), SERVICE),
        false,
      );
    assertStrictEquals(trustedInternalCron(cron, null, SERVICE), false);
    // No key configured: never trusted.
    assertStrictEquals(trustedInternalCron(cron, bearer(""), ""), false);
    // The service role without the flag is not a cron call either.
    assertStrictEquals(
      trustedInternalCron({ table_id: "t" }, bearer(SERVICE), SERVICE),
      false,
    );
    assertStrictEquals(
      trustedInternalCron({ _internal_cron: "true" }, bearer(SERVICE), SERVICE),
      false,
    );
    assertStrictEquals(
      trustedInternalCron(null, bearer(SERVICE), SERVICE),
      false,
    );
  },
);

// manus-notify: MANUS_MCP_BEARER or the service-role key; fails closed.
const notify = (token: string | null, secret: string | null) =>
  authorizeSecretOrServiceRole({
    authorization: token === null ? null : bearer(token),
    secret,
    serviceRoleKey: SERVICE,
  });

Deno.test("manus-notify: shared secret or service role", () => {
  assertEquals(notify("manus-secret", "manus-secret"), {
    ok: true,
    via: "secret",
  });
  assertEquals(notify(SERVICE, "manus-secret"), {
    ok: true,
    via: "service_role",
  });
  assertEquals(notify(SERVICE, null), { ok: true, via: "service_role" });
});

Deno.test("manus-notify: anon, user JWT and wrong secret get refused", () => {
  for (const secret of ["manus-secret", null, "", "  "]) {
    for (const token of [ANON_KEY, USER_JWT, FOREIGN_SERVICE_KEY, "nope"])
      assertEquals(notify(token, secret), { ok: false });
    assertEquals(notify(null, secret), { ok: false });
  }
  // Unset secret: an empty bearer never matches it.
  assertEquals(notify("", null), { ok: false });
  assertEquals(
    authorizeSecretOrServiceRole({
      authorization: bearer("anything"),
      secret: null,
      serviceRoleKey: "",
    }),
    { ok: false },
  );
});
