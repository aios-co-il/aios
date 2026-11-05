import {
  assertMatch,
  assertNotStrictEquals,
  assertStrictEquals,
} from "jsr:@std/assert@1";

import { hourlyDedupeRef, stableHash } from "./client-card-dedupe-ref.ts";

const CAMPAIGNER_USER = "33333333-3333-4333-8333-333333333333";
const OWNER_USER = "44444444-4444-4444-8444-444444444444";
const NOW = new Date("2026-10-26T09:15:00Z");

Deno.test(
  "hourlyDedupeRef is stable within the hour and differs by text, person and hour",
  () => {
    const a = hourlyDedupeRef("t", CAMPAIGNER_USER, "note\nhello", NOW);
    assertStrictEquals(
      a,
      hourlyDedupeRef(
        "t",
        CAMPAIGNER_USER,
        "note\nhello",
        new Date("2026-10-26T09:59:59Z"),
      ),
    );
    assertMatch(a, /^t:33333333-3333-4333-8333-333333333333:2026-10-26T09:/);
    assertNotStrictEquals(
      a,
      hourlyDedupeRef("t", CAMPAIGNER_USER, "note\nhello!", NOW),
    );
    assertNotStrictEquals(
      a,
      hourlyDedupeRef("t", OWNER_USER, "note\nhello", NOW),
    );
    assertNotStrictEquals(
      a,
      hourlyDedupeRef(
        "t",
        CAMPAIGNER_USER,
        "note\nhello",
        new Date("2026-10-26T10:00:00Z"),
      ),
    );
    assertMatch(hourlyDedupeRef("t", "system", "x", NOW), /^t:system:/);
    assertStrictEquals(stableHash("שלום"), stableHash("שלום"));
    assertNotStrictEquals(stableHash("שלום"), stableHash("שלום."));
  },
);
