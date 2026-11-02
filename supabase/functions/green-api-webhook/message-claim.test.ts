import { assert, assertEquals } from "jsr:@std/assert@1";

import { fakeClaimTables } from "./fake-claim-tables.ts";
import {
  claimWebhookMessage,
  MESSAGE_CLAIM_PROVIDER,
} from "./message-claim.ts";

const TENANT = "11111111-1111-4111-8111-111111111111";
const LINE = "77777777-7777-4777-8777-777777777777";
const SECOND_LINE = "55555555-5555-4555-8555-555555555555";
const ID = "BAE5F1";
const KEY = { tenantId: TENANT, integrationId: LINE, idMessage: ID };
const CLAIM_ID = `${LINE}:${ID}`;

/** An ISO time the given number of minutes ago. */
const minutesAgo = (minutes: number) =>
  new Date(Date.now() - minutes * 60_000).toISOString();

/** KEY's claim row as green-api-webhook stores it, with the given fields. */
const claimRow = (fields: Record<string, unknown>) => ({
  provider: MESSAGE_CLAIM_PROVIDER,
  tenant_id: TENANT,
  external_message_id: CLAIM_ID,
  ...fields,
});

Deno.test("claimWebhookMessage", async (t) => {
  await t.step(
    "a redelivery after the message is stored is dropped",
    async () => {
      const db = fakeClaimTables();
      const first = await claimWebhookMessage(KEY, db);
      assertEquals(first.duplicate, false);
      await first.complete();
      assertEquals((await claimWebhookMessage(KEY, db)).duplicate, true);
      assertEquals(db.claims.length, 1);
    },
  );

  await t.step("of two concurrent deliveries, one owns the claim", async () => {
    const db = fakeClaimTables();
    const claims = await Promise.all([
      claimWebhookMessage(KEY, db),
      claimWebhookMessage(KEY, db),
    ]);
    assertEquals(claims.map((claim) => claim.duplicate).sort(), [false, true]);
  });

  await t.step(
    "each line of the tenant claims its own delivery, with or without a user",
    async () => {
      // Two Green lines in one group, neither with a user_id: the claim is
      // keyed by the line, so both store the message.
      const db = fakeClaimTables();
      const first = await claimWebhookMessage(KEY, db);
      const second = await claimWebhookMessage(
        { ...KEY, integrationId: SECOND_LINE },
        db,
      );
      assertEquals([first.duplicate, second.duplicate], [false, false]);
      assertEquals(db.claims.map((claim) => claim.external_message_id).sort(), [
        `${SECOND_LINE}:${ID}`,
        CLAIM_ID,
      ]);
    },
  );

  await t.step(
    "a delivery that outlived its lease cannot release or complete the retry's claim",
    async () => {
      const db = fakeClaimTables();
      const stale = await claimWebhookMessage(
        KEY,
        db,
        () => Date.now() - 10 * 60_000,
      );
      const retry = await claimWebhookMessage(KEY, db);
      assertEquals([stale.duplicate, retry.duplicate], [false, false]);

      // The stale delivery then throws (release) or finishes (complete).
      await stale.release();
      await stale.complete();
      assertEquals(db.claims.length, 1);
      assertEquals(db.claims[0].completed_at, null);
      assertEquals((await claimWebhookMessage(KEY, db)).duplicate, true);

      await retry.complete();
      assert(db.claims[0].completed_at, "the retry completes its own claim");
    },
  );

  await t.step(
    "a failed delivery releases its claim; the retry is handled",
    async () => {
      const db = fakeClaimTables();
      await (await claimWebhookMessage(KEY, db)).release();
      assertEquals(db.claims.length, 0);
      assertEquals((await claimWebhookMessage(KEY, db)).duplicate, false);
    },
  );

  await t.step(
    "a failure after the message is stored keeps the claim",
    async () => {
      const db = fakeClaimTables();
      const claim = await claimWebhookMessage(KEY, db);
      await claim.complete();
      await claim.release();
      assertEquals(db.claims.length, 1);
      assert(db.claims[0].completed_at);
    },
  );

  await t.step(
    "an unfinished claim inside its lease drops the retry",
    async () => {
      const db = fakeClaimTables({
        claims: [claimRow({ processed_at: minutesAgo(1) })],
      });
      assertEquals((await claimWebhookMessage(KEY, db)).duplicate, true);
    },
  );

  await t.step(
    "a stale unfinished claim is taken over by one retry",
    async () => {
      const db = fakeClaimTables({
        claims: [claimRow({ processed_at: minutesAgo(10) })],
      });
      const retries = await Promise.all([
        claimWebhookMessage(KEY, db),
        claimWebhookMessage(KEY, db),
      ]);
      assertEquals(retries.map((claim) => claim.duplicate).sort(), [
        false,
        true,
      ]);
    },
  );

  await t.step("a completed claim is never taken over", async () => {
    const db = fakeClaimTables({
      claims: [
        claimRow({
          processed_at: minutesAgo(60),
          completed_at: minutesAgo(59),
        }),
      ],
    });
    assertEquals((await claimWebhookMessage(KEY, db)).duplicate, true);
  });

  await t.step(
    "a failed claim insert processes the message unclaimed",
    async () => {
      const db = fakeClaimTables({}, { failInsert: { code: "57014" } });
      const claim = await claimWebhookMessage(KEY, db);
      assertEquals(claim.duplicate, false);
      await claim.release();
      assertEquals(db.claims.length, 0);
    },
  );

  await t.step(
    "a failed lookup of the existing claim drops the retry",
    async () => {
      const db = fakeClaimTables(
        { claims: [claimRow({ processed_at: minutesAgo(10) })] },
        { failSelect: { code: "57014" } },
      );
      assertEquals((await claimWebhookMessage(KEY, db)).duplicate, true);
    },
  );

  await t.step(
    "a message without an idMessage is processed unclaimed",
    async () => {
      const db = fakeClaimTables();
      assertEquals(
        (await claimWebhookMessage({ ...KEY, idMessage: undefined }, db))
          .duplicate,
        false,
      );
      assertEquals(db.claims.length, 0);
    },
  );
});
