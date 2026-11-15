import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import {
  CLAIM_WAIT_MS,
  cloudSessionIdOf,
  continuesSessions,
  deliverFollowup,
  fitsFollowup,
  type FollowupStore,
  SEND_WAIT_MS,
  sessionIdleLimitMs,
} from "./claude-session.ts";

/** A queue whose row moves through the statuses a test scripts, one per status read. */
function fakeStore(script: Array<string | null>) {
  const calls: Array<string> = [];
  let status = script[0] ?? null;
  const store: FollowupStore = {
    queue: (prompt) => {
      calls.push(`queue:${prompt}`);
      return Promise.resolve("row-1");
    },
    status: () => {
      if (script.length > 1) {
        script.shift();
      }
      status = script[0] ?? null;
      calls.push(`status:${status}`);
      return Promise.resolve(isStatus(status) ? status : null);
    },
    cancelQueued: () => {
      calls.push("cancel");
      return Promise.resolve(status === "queued");
    },
    failSending: () => {
      calls.push("fail");
      return Promise.resolve(status === "sending");
    },
  };
  return { store, calls };
}

function isStatus(
  value: string | null,
): value is "queued" | "sending" | "sent" | "failed" | "cancelled" {
  return value !== null;
}

/** A clock that advances by each sleep, so waits take no real time. */
function fakeClock() {
  let at = 0;
  return {
    now: () => at,
    sleep: (ms: number) => {
      at += ms;
      return Promise.resolve();
    },
  };
}

Deno.test("deliverFollowup", async (t) => {
  await t.step("is delivered when the worker sends it", async () => {
    const { store, calls } = fakeStore(["", "queued", "sending", "sent"]);
    assertStrictEquals(
      await deliverFollowup({ store, prompt: "hi", ...fakeClock() }),
      true,
    );
    assertEquals(calls[0], "queue:hi");
    assertEquals(calls.includes("cancel"), false);
  });

  await t.step("is not delivered when the worker's send fails", async () => {
    const { store } = fakeStore(["", "sending", "failed"]);
    assertStrictEquals(
      await deliverFollowup({ store, prompt: "hi", ...fakeClock() }),
      false,
    );
  });

  await t.step(
    "is cancelled when no worker claims it, so it cannot be sent late",
    async () => {
      const { store, calls } = fakeStore(["", "queued"]);
      const clock = fakeClock();
      assertStrictEquals(
        await deliverFollowup({ store, prompt: "hi", ...clock }),
        false,
      );
      assertEquals(calls.at(-1), "cancel");
      assertEquals(clock.now() >= CLAIM_WAIT_MS, true);
      assertEquals(clock.now() < CLAIM_WAIT_MS + SEND_WAIT_MS, true);
    },
  );

  await t.step(
    "keeps waiting when a worker claims it just before the cancel",
    async () => {
      // The cancel finds the row already claimed (status sending), then the verdict arrives.
      const script = [
        "",
        ...Array<string>(CLAIM_WAIT_MS / 500).fill("queued"),
        "sending",
        "sent",
      ];
      const { store } = fakeStore(script);
      const clock = fakeClock();
      const cancel = store.cancelQueued;
      store.cancelQueued = async (id) => {
        script.shift();
        await cancel(id);
        return false;
      };
      assertStrictEquals(
        await deliverFollowup({ store, prompt: "hi", ...clock }),
        true,
      );
    },
  );

  await t.step(
    "fails a claimed row whose worker never gives a verdict",
    async () => {
      const { store, calls } = fakeStore(["", "sending"]);
      const clock = fakeClock();
      assertStrictEquals(
        await deliverFollowup({ store, prompt: "hi", ...clock }),
        false,
      );
      assertEquals(calls.at(-1), "fail");
      assertEquals(clock.now() >= CLAIM_WAIT_MS + SEND_WAIT_MS, true);
    },
  );

  await t.step("is not delivered when the row is gone", async () => {
    const { store } = fakeStore(["", null]);
    assertStrictEquals(
      await deliverFollowup({ store, prompt: "hi", ...fakeClock() }),
      false,
    );
  });
});

Deno.test("cloudSessionIdOf", async (t) => {
  await t.step("turns the fire's cse_ id into the CLI's session_ id", () => {
    assertStrictEquals(
      cloudSessionIdOf({ claude_code_session_id: "cse_015S56Bkx8rHsUqh" }),
      "session_015S56Bkx8rHsUqh",
    );
  });

  await t.step("reads the id from the session URL", () => {
    assertStrictEquals(
      cloudSessionIdOf({
        claude_code_session_url: "https://claude.ai/code/cse_01AbC?from=api",
      }),
      "session_01AbC",
    );
  });

  await t.step("refuses anything that is not a session id", () => {
    assertStrictEquals(cloudSessionIdOf({}), null);
    assertStrictEquals(
      cloudSessionIdOf({ claude_code_session_id: "--dangerous" }),
      null,
    );
    assertStrictEquals(
      cloudSessionIdOf({ claude_code_session_url: "https://claude.ai/code/" }),
      null,
    );
  });
});

Deno.test("settings", async (t) => {
  await t.step("continuing is off unless the environment turns it on", () => {
    assertStrictEquals(continuesSessions({}), false);
    assertStrictEquals(
      continuesSessions({ CLAUDE_SESSION_WORKER: "0" }),
      false,
    );
    assertStrictEquals(continuesSessions({ CLAUDE_SESSION_WORKER: "1" }), true);
  });

  await t.step("a session takes follow-ups for a day by default", () => {
    assertStrictEquals(sessionIdleLimitMs({}), 24 * 3_600_000);
    assertStrictEquals(
      sessionIdleLimitMs({ CLAUDE_SESSION_IDLE_HOURS: "2" }),
      2 * 3_600_000,
    );
    assertStrictEquals(
      sessionIdleLimitMs({ CLAUDE_SESSION_IDLE_HOURS: "nope" }),
      24 * 3_600_000,
    );
  });

  await t.step(
    "a prompt larger than a command-line argument does not fit",
    () => {
      assertStrictEquals(fitsFollowup("שלום"), true);
      assertStrictEquals(fitsFollowup("א".repeat(60_000)), false);
    },
  );
});
