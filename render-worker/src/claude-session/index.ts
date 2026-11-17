// Claude session worker (AIO-600). Sends each queued Claude Direct follow-up into the cloud
// session its conversation already has, through the Claude CLI signed in on this machine.
// The claim gives out one message per session at a time, so a conversation's follow-ups arrive in
// the order they were sent; one slot is enough for the single Claude account this worker serves.
import { setTimeout as wait } from "node:timers/promises";
import { runSlots } from "../loop.ts";
import { createSupabaseRest } from "../supabaseRest.ts";
import { loadTargets } from "../targets.ts";
import { sendToCloudSession } from "./cli.ts";
import { deliverNext } from "./deliver.ts";

/** The edge function stops waiting for a claim after 8 s, so the queue is read often. */
const POLL_MS = Number(process.env.POLL_MS) || 1000;
const WORKER_ID = process.env.WORKER_ID || `claude-session-${process.pid}`;

const [target] = loadTargets();
const db = createSupabaseRest({
  url: target.url,
  serviceRoleKey: target.serviceRoleKey,
});

let stopping = false;
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    stopping = true;
  });
}

console.log(`[claude-session] ${WORKER_ID} serving ${target.name}`);
await runSlots({
  concurrency: 1,
  shouldStop: () => stopping,
  sleep: () => wait(POLL_MS),
  onError: (error) => console.error("[claude-session]", error),
  processOne: () =>
    deliverNext({
      db,
      workerId: `${WORKER_ID}-${target.name}`,
      send: sendToCloudSession,
      log: (line) => console.log(`[claude-session] ${line}`),
    }),
});
