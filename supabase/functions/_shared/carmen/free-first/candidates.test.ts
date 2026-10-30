import {
  assertEquals,
  assertNotStrictEquals,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import {
  candidatesFromConnections,
  failureKindFor,
  pickableConnections,
} from "./candidates.ts";
import { routeCarmenTask } from "./router.ts";
import { classifyCarmenTask } from "./classifier.ts";

const conns = [
  { id: "a", provider_preset: "openai", profile: {}, key_last4: "1111" },
  {
    id: "b",
    provider_preset: "groq",
    profile: { tier: "free" as const, client_data_ok: true },
    key_last4: "2222",
  },
  {
    id: "c",
    provider_preset: "nvidia",
    profile: { tier: "free" as const },
    key_last4: "3333",
  },
  {
    id: "d",
    provider_preset: "groq",
    profile: { tier: "free" as const, client_data_ok: true },
    key_last4: null,
  },
];

Deno.test(
  "brains without a key are skipped; tier and client data follow the profile",
  () => {
    const out = candidatesFromConnections(conns);
    assertEquals(
      out.map((c) => [c.id, c.tier, c.approvedForClientData]),
      [
        ["a", "premium", false],
        ["b", "free", true],
        ["c", "free", false],
      ],
    );
  },
);

Deno.test(
  "smart routing sends a plain question to the approved free brain",
  () => {
    const task = classifyCarmenTask("תכתוב קופי למודעה", {
      containsClientData: true,
    });
    const decision = routeCarmenTask(
      task,
      { mode: "free_first", allowAutomaticPremium: false },
      candidatesFromConnections(conns),
    );
    assertStrictEquals(decision.status, "ready");
    assertStrictEquals(decision.modelId, "b");
  },
);

Deno.test(
  "without an approved free brain a paid one is never run automatically",
  () => {
    const task = classifyCarmenTask("תכתוב קופי למודעה", {
      containsClientData: true,
    });
    const decision = routeCarmenTask(
      task,
      { mode: "free_first", allowAutomaticPremium: false },
      candidatesFromConnections(conns.filter((c) => c.id !== "b")),
    );
    assertNotStrictEquals(decision.status, "ready");
  },
);

Deno.test("HTTP statuses map to failover kinds", () => {
  assertStrictEquals(failureKindFor(0), "timeout");
  assertStrictEquals(failureKindFor(429), "rate_limit");
  assertStrictEquals(failureKindFor(401), "authentication");
  assertStrictEquals(failureKindFor(503), "provider_unavailable");
  assertStrictEquals(failureKindFor(400), "invalid_request");
});

Deno.test(
  "only brains shown in the picker and granted to the user are routable",
  () => {
    const routes = [
      { slug: "groq-a", connection_id: "a", active: true },
      { slug: "groq-b", connection_id: "b", active: false },
      { slug: "groq-c", connection_id: "c", active: true },
      { slug: "orphan", connection_id: null, active: true },
    ];
    const ids = (allowed: (s: string) => boolean) =>
      pickableConnections(conns, routes, allowed).map((c) => c.id);
    assertEquals(
      ids(() => true),
      ["a", "c"],
    );
    assertEquals(
      ids((s) => s !== "groq-c"),
      ["a"],
    );
  },
);
