import { assertEquals } from "jsr:@std/assert@1";

import {
  isClaimLeaseExpired,
  MESSAGE_CLAIM_LEASE_MS,
} from "./message-claim-lease.ts";

Deno.test("isClaimLeaseExpired", async (t) => {
  const claimedAt = "2026-10-24T10:00:00Z";
  const start = Date.parse(claimedAt);

  await t.step("a completed claim never expires", () => {
    assertEquals(
      isClaimLeaseExpired(
        { processed_at: claimedAt, completed_at: "2026-10-24T10:00:05Z" },
        start + 24 * 60 * 60_000,
      ),
      false,
    );
  });

  await t.step("an unfinished claim expires at the end of its lease", () => {
    const claim = { processed_at: claimedAt, completed_at: null };
    assertEquals(isClaimLeaseExpired(claim, start + 60_000), false);
    assertEquals(
      isClaimLeaseExpired(claim, start + MESSAGE_CLAIM_LEASE_MS),
      true,
    );
  });

  await t.step("an unfinished claim without a readable time is expired", () => {
    assertEquals(
      isClaimLeaseExpired({ processed_at: null, completed_at: null }, start),
      true,
    );
    assertEquals(
      isClaimLeaseExpired({ processed_at: "never", completed_at: null }, start),
      true,
    );
  });
});
