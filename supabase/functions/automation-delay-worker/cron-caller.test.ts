import { assertStrictEquals } from "jsr:@std/assert@1";
import { isCronCaller } from "./cron-caller.ts";

/** One base64 part of a JWT. */
function jwtPart(value: object): string {
  return btoa(JSON.stringify(value)).replace(/=+$/, "");
}

/** An unsigned JWT with the given role, as the gateway would have verified it. */
function jwtWithRole(role: string): string {
  return `${jwtPart({ alg: "HS256" })}.${jwtPart({ role })}.signature`;
}

/** A function env with a legacy key and one new secret key. */
function env(name: string): string | undefined {
  return {
    SUPABASE_SERVICE_ROLE_KEY: "legacy-service-key",
    SUPABASE_SECRET_KEYS: JSON.stringify({ default: "sb_secret_staging" }),
  }[name];
}

Deno.test("isCronCaller", async (t) => {
  await t.step("accepts the new secret key Staging's cron sends", () => {
    assertStrictEquals(isCronCaller("Bearer sb_secret_staging", env), true);
  });

  await t.step("accepts the legacy service-role key", () => {
    assertStrictEquals(isCronCaller("Bearer legacy-service-key", env), true);
  });

  await t.step(
    "accepts a service-role JWT that differs from the env key",
    () => {
      assertStrictEquals(
        isCronCaller(`Bearer ${jwtWithRole("service_role")}`, env),
        true,
      );
    },
  );

  await t.step("rejects a signed-in user and the anon key", () => {
    assertStrictEquals(
      isCronCaller(`Bearer ${jwtWithRole("authenticated")}`, env),
      false,
    );
    assertStrictEquals(
      isCronCaller(`Bearer ${jwtWithRole("anon")}`, env),
      false,
    );
  });

  await t.step("rejects an unknown key and a missing header", () => {
    assertStrictEquals(isCronCaller("Bearer sb_secret_other", env), false);
    assertStrictEquals(isCronCaller(null, env), false);
  });
});
