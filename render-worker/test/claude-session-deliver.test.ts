import { describe, expect, test } from "vitest";
import { deliverNext } from "../src/claude-session/deliver.ts";

/** A queue holding the given claimed rows, recording what the worker writes back. */
function fakeDb(claimed: Array<object>) {
  const updates: Array<{ table: string; query: string; patch: object }> = [];
  const claims: Array<object | undefined> = [];
  return {
    updates,
    claims,
    db: {
      rpc: async (_name: string, args?: object) => {
        claims.push(args);
        return claimed.splice(0, 1);
      },
      update: async (table: string, query: string, patch: object) => {
        updates.push({ table, query, patch });
        return [];
      },
    },
  };
}

const row = {
  id: "11111111-1111-4111-8111-111111111111",
  cloud_session_id: "session_01AbC",
  prompt: "[AIOS] hello",
  claimed_at: "2026-11-17T10:00:00.000Z",
};
/** A moment after the row was claimed. */
function now() {
  return Date.parse(row.claimed_at) + 1000;
}

describe("deliverNext", () => {
  test("an empty queue does no work", async () => {
    const { db, updates } = fakeDb([]);
    const sent: Array<object> = [];
    const worked = await deliverNext({
      db,
      workerId: "w1",
      now,
      send: async (args) => void sent.push(args),
    });
    expect(worked).toBe(false);
    expect(sent).toEqual([]);
    expect(updates).toEqual([]);
  });

  test("a claimed follow-up is sent and its prompt cleared", async () => {
    const { db, updates, claims } = fakeDb([row]);
    const sent: Array<object> = [];
    const worked = await deliverNext({
      db,
      workerId: "w1",
      now,
      send: async (args) => void sent.push(args),
    });
    expect(worked).toBe(true);
    expect(claims).toEqual([{ p_worker: "w1" }]);
    expect(sent).toEqual([
      { sessionId: "session_01AbC", prompt: "[AIOS] hello" },
    ]);
    expect(updates).toHaveLength(1);
    expect(updates[0].table).toBe("claude_session_messages");
    // Only a row still in "sending" is closed: the edge function may have failed it meanwhile.
    expect(updates[0].query).toBe(`id=eq.${row.id}&status=eq.sending`);
    expect(updates[0].patch).toMatchObject({
      status: "sent",
      error: null,
      prompt: null,
    });
  });

  test("a failed send is recorded as failed with the reason", async () => {
    const { db, updates } = fakeDb([row]);
    const worked = await deliverNext({
      db,
      workerId: "w1",
      now,
      send: async () => {
        throw new Error("Session expired. Please run /login to sign in again.");
      },
    });
    expect(worked).toBe(true);
    expect(updates[0].patch).toMatchObject({
      status: "failed",
      error: "Session expired. Please run /login to sign in again.",
      prompt: null,
    });
  });

  test("a verdict write that fails is retried, so a sent follow-up is recorded as sent", async () => {
    const { db, updates } = fakeDb([row]);
    const update = db.update;
    let writes = 0;
    db.update = async (table, query, patch) => {
      writes += 1;
      if (writes < 3) {
        throw new Error("PATCH: 503");
      }
      return update(table, query, patch);
    };
    let sends = 0;
    await deliverNext({
      db,
      workerId: "w1",
      now,
      send: async () => {
        sends += 1;
      },
      retryWait: async () => {},
    });
    expect(sends).toBe(1);
    expect(writes).toBe(3);
    expect(updates[0].patch).toMatchObject({ status: "sent" });
  });

  test("a verdict that cannot be written leaves the row in sending and is reported", async () => {
    const { db } = fakeDb([row]);
    db.update = async () => {
      throw new Error("PATCH: 503");
    };
    await expect(
      deliverNext({
        db,
        workerId: "w1",
        now,
        send: async () => {},
        retryWait: async () => {},
      }),
    ).rejects.toThrow(/503/);
  });

  test("a claim that is too old, or has no claim time, is failed without sending", async () => {
    for (const claimed of [
      { ...row, claimed_at: "2026-11-17T09:58:00.000Z" },
      { ...row, claimed_at: null },
    ]) {
      const { db, updates } = fakeDb([claimed]);
      let called = false;
      await deliverNext({
        db,
        workerId: "w1",
        now,
        send: async () => {
          called = true;
        },
      });
      expect(called).toBe(false);
      expect(updates[0].patch).toMatchObject({
        status: "failed",
        error: "the claim is too old to send",
      });
    }
  });

  test("a row without a prompt fails without calling the CLI", async () => {
    const { db, updates } = fakeDb([{ ...row, prompt: null }]);
    let called = false;
    await deliverNext({
      db,
      workerId: "w1",
      now,
      send: async () => {
        called = true;
      },
    });
    expect(called).toBe(false);
    expect(updates[0].patch).toMatchObject({ status: "failed" });
  });
});
