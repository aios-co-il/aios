import assert from "node:assert/strict";
import { test } from "node:test";
import {
  approvalCode,
  checkApproval,
  issueApproval,
  spendApproval,
  storedApproval,
  type Quote,
} from "./approval.ts";

const quote: Quote = {
  tool: "workshop_produce_video",
  engine: "higgsfield",
  count: 5,
  usd: 2.5,
};

test("a confirm in the same turn as the quote is refused", () => {
  const { payload } = issueApproval({}, quote, "turn-1", "tok");
  assert.deepEqual(
    checkApproval(payload, quote, { token: "tok", turnId: "turn-1" }),
    { ok: false, reason: "same_turn" },
  );
});

const yes = `מאשר ${approvalCode("tok")}`;

test("a confirm in the next turn with the token and the user's code passes", () => {
  const { payload } = issueApproval({}, quote, "turn-1", "tok");
  assert.deepEqual(
    checkApproval(payload, quote, {
      token: "tok",
      turnId: "turn-2",
      userText: yes,
    }),
    { ok: true },
  );
});

test("a later turn without the code in the user's own message is refused", () => {
  const { payload } = issueApproval({}, quote, "turn-1", "tok");
  assert.deepEqual(
    checkApproval(payload, quote, {
      token: "tok",
      turnId: "turn-2",
      userText: "תסתכלי על האתר",
    }),
    { ok: false, reason: "not_user" },
  );
});

test("a quote older than the time limit is refused", () => {
  const quotedAt = new Date("2026-10-25T10:00:00Z");
  const { payload } = issueApproval({}, quote, "turn-1", "tok", quotedAt);
  assert.deepEqual(
    checkApproval(
      payload,
      quote,
      { token: "tok", turnId: "turn-2", userText: yes },
      new Date("2026-10-25T10:31:00Z"),
    ),
    { ok: false, reason: "expired" },
  );
});

test("a wrong or missing token is refused", () => {
  const { payload } = issueApproval({}, quote, "turn-1", "tok");
  assert.equal(
    checkApproval(payload, quote, { token: "other", turnId: "turn-2" }).ok,
    false,
  );
  assert.equal(checkApproval({}, quote, { turnId: "turn-2" }).ok, false);
});

test("a different engine or higher unit price needs a new approval", () => {
  const { payload } = issueApproval({}, quote, "turn-1", "tok");
  assert.deepEqual(
    checkApproval(
      payload,
      { ...quote, engine: "elevenlabs" },
      { token: "tok", turnId: "turn-2" },
    ),
    { ok: false, reason: "changed" },
  );
  assert.deepEqual(
    checkApproval(
      payload,
      { ...quote, usd: 9 },
      { token: "tok", turnId: "turn-2" },
    ),
    { ok: false, reason: "changed" },
  );
  assert.deepEqual(
    checkApproval(
      payload,
      { ...quote, count: 6, usd: 3 },
      { token: "tok", turnId: "turn-2" },
    ),
    { ok: false, reason: "changed" },
  );
});

test("a queue approval from David skips the message rule, not the price", () => {
  assert.deepEqual(checkApproval({}, quote, { approvedOutOfBand: true }), {
    ok: true,
  });
  const { payload } = issueApproval({}, quote, "turn-1", "tok");
  assert.deepEqual(
    checkApproval(
      payload,
      { ...quote, engine: "elevenlabs" },
      { approvedOutOfBand: true },
    ),
    { ok: false, reason: "changed" },
  );
});

test("spending keeps the rest for the next batch and removes it when done", () => {
  const stills: Quote = {
    tool: "workshop_make_stills",
    engine: "google",
    count: 12,
    usd: 1.2,
  };
  const { payload } = issueApproval({}, stills, "turn-1", "tok");
  const after = spendApproval(payload, stills.tool, 10, "turn-2");
  assert.equal(storedApproval(after, stills.tool)?.left, 2);
  assert.deepEqual(
    checkApproval(
      after,
      { ...stills, count: 2, usd: 0.2 },
      { token: "tok", turnId: "turn-2" },
    ),
    { ok: true },
  );
  const done = spendApproval(after, stills.tool, 2, "turn-2");
  assert.equal(storedApproval(done, stills.tool), null);
});
