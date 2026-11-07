import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import {
  authorizeSecretOrServiceRole,
  bearerFrom,
  isGatewayServiceRoleRequest,
  isServiceRoleRequest,
  jwtRole,
  trustedInternalCron,
} from "./edge-caller-auth.ts";
import { ANON_KEY, FOREIGN_SERVICE_KEY, fakeJwt } from "./jwt-test-fixtures.ts";

const SERVICE = "service-role-key";
const USER_JWT = fakeJwt({ role: "authenticated", sub: "u-owner-a" });
const bearer = (t: string) => `Bearer ${t}`;

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
Deno.test("trustedInternalCron: _internal_cron only from service role", () => {
  const cron = { table_id: "t", _internal_cron: true };
  assertStrictEquals(trustedInternalCron(cron, bearer(SERVICE), SERVICE), true);
  // Ignored for everyone else: they fall through to user auth.
  for (const token of [ANON_KEY, USER_JWT, FOREIGN_SERVICE_KEY, "x"]) {
    assertStrictEquals(
      trustedInternalCron(cron, bearer(token), SERVICE),
      false,
    );
  }
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
});

// manus-notify: MANUS_MCP_BEARER or the service-role key; fails closed.
const notify = (token: string | null, secret: string | null) =>
  authorizeSecretOrServiceRole({
    authorization: token === null ? null : bearer(token),
    secret,
    serviceRoleKey: SERVICE,
  });

Deno.test("authorizeSecretOrServiceRole: shared secret or service role", () => {
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

Deno.test(
  "authorizeSecretOrServiceRole: anon, user JWT and wrong secret get refused",
  () => {
    for (const secret of ["manus-secret", null, "", "  "]) {
      for (const token of [ANON_KEY, USER_JWT, FOREIGN_SERVICE_KEY, "nope"]) {
        assertEquals(notify(token, secret), { ok: false });
      }
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
  },
);

const ENV_KEY = "sb_secret_env_key";
const VAULT_ENV_KEY_JWT = fakeJwt({ role: "service_role", iss: "supabase" });
const FUNCTIONS_DIR = new URL("../../", import.meta.url);

Deno.test("gateway service role: the env key or a service_role JWT", () => {
  assertStrictEquals(
    isGatewayServiceRoleRequest(bearer(ENV_KEY), ENV_KEY),
    true,
  );
  // The cron's Vault key differs from the env key (AIO-503).
  assertStrictEquals(
    isGatewayServiceRoleRequest(bearer(VAULT_ENV_KEY_JWT), ENV_KEY),
    true,
  );
  assertStrictEquals(
    isGatewayServiceRoleRequest(bearer(ANON_KEY), ENV_KEY),
    false,
  );
  assertStrictEquals(
    isGatewayServiceRoleRequest(
      bearer(fakeJwt({ role: "authenticated" })),
      ENV_KEY,
    ),
    false,
  );
  assertStrictEquals(
    isGatewayServiceRoleRequest(bearer("other"), ENV_KEY),
    false,
  );
  assertStrictEquals(isGatewayServiceRoleRequest(null, ENV_KEY), false);
  assertStrictEquals(isGatewayServiceRoleRequest(VAULT_ENV_KEY_JWT, ""), false);
});

Deno.test(
  "every function using the gateway check has verify_jwt = true",
  async () => {
    const config = await Deno.readTextFile(
      new URL("../config.toml", FUNCTIONS_DIR),
    );
    const users = await functionsImporting("isGatewayServiceRoleRequest");
    assertEquals(users.length > 0, true);
    const unverified = users.filter((name) => !verifiesJwt(config, name));
    assertEquals(unverified, []);
  },
);

/** Function folders (not _shared) whose non-test sources name `symbol`. */
async function functionsImporting(symbol: string): Promise<Array<string>> {
  const names: Array<string> = [];
  for await (const entry of Deno.readDir(FUNCTIONS_DIR)) {
    if (!entry.isDirectory || entry.name.startsWith("_")) {
      continue;
    }
    if (await folderNames(new URL(`${entry.name}/`, FUNCTIONS_DIR), symbol)) {
      names.push(entry.name);
    }
  }
  return names.sort();
}

/** True when a non-test .ts file under `dir` contains `symbol`. */
async function folderNames(dir: URL, symbol: string): Promise<boolean> {
  for await (const entry of Deno.readDir(dir)) {
    const url = new URL(entry.isDirectory ? `${entry.name}/` : entry.name, dir);
    if (entry.isDirectory) {
      if (await folderNames(url, symbol)) {
        return true;
      }
    } else if (
      entry.name.endsWith(".ts") &&
      !entry.name.endsWith(".test.ts") &&
      (await Deno.readTextFile(url)).includes(symbol)
    ) {
      return true;
    }
  }
  return false;
}

/** True when config.toml's [functions.<name>] section sets verify_jwt = true. */
function verifiesJwt(config: string, name: string): boolean {
  const start = config.indexOf(`[functions.${name}]`);
  if (start < 0) {
    return false;
  }
  const next = config.indexOf("\n[", start + 1);
  const section = config.slice(start, next < 0 ? undefined : next);
  return /^verify_jwt\s*=\s*true\s*$/m.test(section);
}
