import {
  assert,
  assertEquals,
  assertStrictEquals,
  assertThrows,
} from "jsr:@std/assert@1";
import {
  AGENT_EDGE_SECRET_ALLOWLIST,
  assertSafeTargetRef,
  isForbiddenSecretName,
  projectRefFromSupabaseUrl,
  selectSecretsToCopy,
} from "./copy-edge-secrets.ts";

Deno.test("default copy list is the agent allowlist", () => {
  assertEquals(selectSecretsToCopy(null), [...AGENT_EDGE_SECRET_ALLOWLIST]);
  assert(selectSecretsToCopy(null).includes("CURSOR_API_KEY"));
});

Deno.test("requested names are filtered to the allowlist", () => {
  assertEquals(
    selectSecretsToCopy([
      "CURSOR_API_KEY",
      "META_WHATSAPP_CONFIG_ID",
      "SUPABASE_DB_URL",
      "nope",
    ]),
    ["CURSOR_API_KEY"],
  );
});

Deno.test("customer and project secrets are forbidden", () => {
  assertStrictEquals(
    isForbiddenSecretName("META_WHATSAPP_WEBHOOK_VERIFY_TOKEN"),
    true,
  );
  assertStrictEquals(isForbiddenSecretName("FACEBOOK_APP_SECRET"), true);
  assertStrictEquals(isForbiddenSecretName("SUPABASE_SERVICE_ROLE_KEY"), true);
  assertStrictEquals(isForbiddenSecretName("CURSOR_API_KEY"), false);
});

Deno.test("refuses copying onto the source project", () => {
  const src = "zvoijyneresvkadpprel";
  assertStrictEquals(
    assertSafeTargetRef("mzjsuvatrzhciojmbbbm", src),
    "mzjsuvatrzhciojmbbbm",
  );
  assertThrows(() => assertSafeTargetRef(src, src), Error, "source project");
  assertThrows(() => assertSafeTargetRef("not-a-ref", src), Error, "invalid");
});

Deno.test("project ref from supabase url", () => {
  assertStrictEquals(
    projectRefFromSupabaseUrl("https://zvoijyneresvkadpprel.supabase.co"),
    "zvoijyneresvkadpprel",
  );
});
