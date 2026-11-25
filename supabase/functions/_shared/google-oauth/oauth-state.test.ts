import { assertEquals, assertNotEquals } from "jsr:@std/assert@1";
import { signOAuthState, verifyOAuthState } from "./oauth-state.ts";

const SECRET = "test-state-secret";

const NOW = Date.UTC(2026, 10, 19, 12, 0, 0);

const INPUT = {
  userId: "11111111-1111-4111-8111-111111111111",
  tenantId: "22222222-2222-4222-8222-222222222222",
  origin: "https://aios.co.il",
  addNew: false,
};

/** Fifteen minutes, the state's lifetime. */
const TTL_MS = 15 * 60 * 1000;

Deno.test("a signed state verifies and carries its input", async () => {
  const state = await signOAuthState(INPUT, SECRET, NOW);

  assertEquals(await verifyOAuthState(state, SECRET, NOW), {
    ...INPUT,
    exp: NOW + TTL_MS,
  });
});

Deno.test("a state forged without the secret is rejected", async () => {
  const forged = btoa(JSON.stringify({ ...INPUT, exp: NOW + TTL_MS }));

  assertEquals(await verifyOAuthState(forged, SECRET, NOW), null);
  assertEquals(await verifyOAuthState(`${forged}.deadbeef`, SECRET, NOW), null);
  assertEquals(await verifyOAuthState(INPUT.userId, SECRET, NOW), null);
});

Deno.test("a state signed with another secret is rejected", async () => {
  const state = await signOAuthState(INPUT, "other-secret", NOW);

  assertEquals(await verifyOAuthState(state, SECRET, NOW), null);
});

Deno.test("a state whose payload was changed is rejected", async () => {
  const state = await signOAuthState(INPUT, SECRET, NOW);
  const [, signature] = state.split(".");
  const victim = btoa(
    JSON.stringify({
      ...INPUT,
      userId: "33333333-3333-4333-8333-333333333333",
      exp: NOW + TTL_MS,
    }),
  );

  assertNotEquals(state.split(".")[0], victim);
  assertEquals(
    await verifyOAuthState(`${victim}.${signature}`, SECRET, NOW),
    null,
  );
});

Deno.test("an expired state is rejected", async () => {
  const state = await signOAuthState(INPUT, SECRET, NOW);

  assertEquals(await verifyOAuthState(state, SECRET, NOW + TTL_MS + 1), null);
});

Deno.test("a missing or malformed state is rejected", async () => {
  assertEquals(await verifyOAuthState(null, SECRET, NOW), null);
  assertEquals(await verifyOAuthState("", SECRET, NOW), null);
  assertEquals(await verifyOAuthState("a.b.c", SECRET, NOW), null);
});
