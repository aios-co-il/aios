import { assertStrictEquals } from "jsr:@std/assert@1";
import { orgVoiceKeyAllowed } from "./voice-access.ts";

Deno.test("owner may use the org key on Production", () => {
  assertStrictEquals(
    orgVoiceKeyAllowed("david.castelnuovo@gmail.com", "production"),
    true,
  );
});

Deno.test("other users need a personal key on Production", () => {
  assertStrictEquals(
    orgVoiceKeyAllowed("admin@aios.test", "production"),
    false,
  );
  assertStrictEquals(orgVoiceKeyAllowed("admin@aios.test", undefined), false);
  assertStrictEquals(orgVoiceKeyAllowed("admin@aios.test", "bogus"), false);
});

Deno.test("every signed-in user may use the org key outside Production", () => {
  assertStrictEquals(orgVoiceKeyAllowed("admin@aios.test", "preview"), true);
  assertStrictEquals(orgVoiceKeyAllowed("admin@aios.test", "staging"), true);
  assertStrictEquals(orgVoiceKeyAllowed(null, "preview"), false);
});
