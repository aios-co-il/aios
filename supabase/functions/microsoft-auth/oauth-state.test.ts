import { assertEquals } from "jsr:@std/assert";
import { signState, verifyState } from "./oauth-state.ts";

const userId = "11111111-1111-4111-8111-111111111111";

const tenantId = "22222222-2222-4222-8222-222222222222";

Deno.test("signed state round-trips the user and tenant", async () => {
  const now = 1_700_000_000_000;
  const state = await signState("secret", userId, tenantId, now);
  const parsed = await verifyState("secret", state, now + 60_000);
  assertEquals(parsed?.userId, userId);
  assertEquals(parsed?.tenantId, tenantId);
});

Deno.test("state signed with another secret is rejected", async () => {
  const state = await signState("other", userId, tenantId);
  assertEquals(await verifyState("secret", state), null);
});

Deno.test("tampered state is rejected", async () => {
  const state = await signState("secret", userId, tenantId);
  const [, sig] = state.split(".");
  const forged = btoa(
    JSON.stringify({ userId, tenantId: "attacker", exp: Date.now() + 1e6 }),
  ).replace(/=+$/, "");
  assertEquals(await verifyState("secret", `${forged}.${sig}`), null);
});

Deno.test("expired state is rejected", async () => {
  const now = 1_700_000_000_000;
  const state = await signState("secret", userId, tenantId, now);
  assertEquals(await verifyState("secret", state, now + 16 * 60_000), null);
});

Deno.test("legacy userId|tenantId state is rejected", async () => {
  assertEquals(await verifyState("secret", `${userId}|${tenantId}`), null);
});
