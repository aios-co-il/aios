import { expect, test } from "vitest";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { createInFlight } from "../src/inflight.mjs";

const REQUEUED = {
  status: "queued",
  error: "worker stopped during the job; queued again",
};
const tick = (ms = 10) => new Promise((resolve) => setTimeout(resolve, ms));

function fakeDb() {
  const updates = [];
  return {
    updates,
    update: async (table, query, patch) => {
      updates.push({ table, query, patch });
      return [{}];
    },
  };
}

test("a stop puts held runs back to queued and leaves their provider job alone", async () => {
  const db = fakeDb();
  const inFlight = createInFlight();
  inFlight.hold(db, { id: "r1" });
  inFlight.hold(db, { id: "r2" });
  inFlight.release({ id: "r2" });
  expect(await inFlight.requeue()).toStrictEqual(["r1"]);
  expect(db.updates).toStrictEqual([
    {
      table: "marketing_runs",
      query: "id=eq.r1&status=eq.running&attempts=eq.0",
      patch: REQUEUED,
    },
  ]);
});

test("a stop waits for a paid submit to save its job id, and no submit starts after it", async () => {
  const db = fakeDb();
  const inFlight = createInFlight();
  const run = { id: "r1" };
  inFlight.hold(db, run);
  const order = [];
  let finish;
  inFlight.submitting(run, async () => {
    await new Promise((resolve) => (finish = resolve));
    order.push("saved");
  });
  const stop = inFlight.requeue({ waitMs: 2000 });
  await tick();
  expect(db.updates.length).toBe(0);
  finish();
  expect(await stop).toStrictEqual(["r1"]);
  order.push("requeued");
  expect(order).toStrictEqual(["saved", "requeued"]);

  let started = false;
  inFlight.submitting(run, async () => (started = true));
  await tick();
  expect(started).toBe(false);
});

test("a run still inside its submit when the wait ends stays running", async () => {
  const db = fakeDb();
  const inFlight = createInFlight();
  const run = { id: "r1" };
  inFlight.hold(db, run);
  inFlight.submitting(run, () => new Promise(() => {}));
  expect(await inFlight.requeue({ waitMs: 100 })).toStrictEqual([]);
  expect(db.updates.length).toBe(0);
});

test("a run being claimed when the stop comes is queued again too", async () => {
  const db = fakeDb();
  const inFlight = createInFlight();
  inFlight
    .claim(tick(30).then(() => [{ id: "r3" }]))
    .then(([run]) => inFlight.hold(db, run));
  expect(await inFlight.requeue()).toStrictEqual(["r3"]);
});

test("on SIGTERM the worker queues its run again and exits", async () => {
  const patches = [];
  let claims = 0;
  let working;
  const inJob = new Promise((resolve) => (working = resolve));
  const server = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => (body += chunk));
    request.on("end", () => {
      response.setHeader("Content-Type", "application/json");
      if (request.url === "/rest/v1/rpc/claim_video_run") {
        claims += 1;
        const run = {
          id: "run-1",
          kind: "render",
          tenant_id: "t1",
          item_id: "i1",
          attempts: 1,
          output: {},
        };
        return response.end(JSON.stringify(claims === 1 ? [run] : []));
      }
      if (request.method === "PATCH") {
        patches.push({ url: request.url, body: JSON.parse(body) });
        return response.end("[{}]");
      }
      // Every read of the job hangs, so the run is still in flight when the signal comes.
      working();
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const child = spawn(
    process.execPath,
    [fileURLToPath(new URL("../src/index.mjs", import.meta.url))],
    {
      env: {
        PATH: process.env.PATH,
        SUPABASE_URL: `http://127.0.0.1:${server.address().port}`,
        SUPABASE_SERVICE_ROLE_KEY: "test-key",
        CONCURRENCY: "1",
        POLL_MS: "50",
        WORKER_ID: "test",
      },
      stdio: "ignore",
    },
  );
  try {
    await inJob;
    child.kill("SIGTERM");
    const exited = await Promise.race([
      once(child, "exit").then(() => true),
      tick(8000).then(() => false),
    ]);
    expect(exited).toBe(true);
    expect(patches).toStrictEqual([
      {
        url: "/rest/v1/marketing_runs?id=eq.run-1&status=eq.running&attempts=eq.1",
        body: REQUEUED,
      },
    ]);
  } finally {
    child.kill("SIGKILL");
    server.closeAllConnections();
    server.close();
  }
});

test("a run out of attempts is left running so it fails instead of looping", async () => {
  const db = fakeDb();
  const inFlight = createInFlight({ maxAttempts: 3 });
  inFlight.hold(db, { id: "last", attempts: 3 });
  inFlight.hold(db, { id: "early", attempts: 1 });
  expect(await inFlight.requeue()).toStrictEqual(["early"]);
  expect(db.updates.map((update) => update.query)).toStrictEqual([
    "id=eq.early&status=eq.running&attempts=eq.1",
  ]);
});
