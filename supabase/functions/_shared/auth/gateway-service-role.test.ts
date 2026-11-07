import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { isGatewayServiceRoleRequest } from "./edge-caller-auth.ts";
import { ANON_KEY, fakeJwt } from "./jwt-test-fixtures.ts";

const SERVICE = "sb_secret_env_key";
const VAULT_SERVICE_JWT = fakeJwt({ role: "service_role", iss: "supabase" });
const bearer = (t: string) => `Bearer ${t}`;
const FUNCTIONS_DIR = new URL("../../", import.meta.url);

Deno.test("gateway service role: the env key or a service_role JWT", () => {
  assertStrictEquals(
    isGatewayServiceRoleRequest(bearer(SERVICE), SERVICE),
    true,
  );
  // The cron's Vault key differs from the env key (AIO-503).
  assertStrictEquals(
    isGatewayServiceRoleRequest(bearer(VAULT_SERVICE_JWT), SERVICE),
    true,
  );
  assertStrictEquals(
    isGatewayServiceRoleRequest(bearer(ANON_KEY), SERVICE),
    false,
  );
  assertStrictEquals(
    isGatewayServiceRoleRequest(
      bearer(fakeJwt({ role: "authenticated" })),
      SERVICE,
    ),
    false,
  );
  assertStrictEquals(
    isGatewayServiceRoleRequest(bearer("other"), SERVICE),
    false,
  );
  assertStrictEquals(isGatewayServiceRoleRequest(null, SERVICE), false);
  assertStrictEquals(isGatewayServiceRoleRequest(VAULT_SERVICE_JWT, ""), false);
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
