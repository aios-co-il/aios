/**
 * Seedance 2.5 text-to-video through the official Higgsfield SDK.
 *
 * Needs HF_CREDENTIALS ("key-id:key-secret") in .env.local, next to this file
 * or at the repo root. Git ignores *.local. Every run is a billable generation.
 *
 *   cd scripts/higgsfield-seedance && pnpm install && pnpm start
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { config, higgsfield } from "@higgsfield/client/v2";

const MODEL = "bytedance/seedance-2.5/text-to-video";

for (const dir of [import.meta.dirname, join(import.meta.dirname, "../..")]) {
  const file = join(dir, ".env.local");
  if (existsSync(file)) process.loadEnvFile(file);
}
const credentials = process.env.HF_CREDENTIALS?.trim();
if (!credentials || !/^[^:\s]+:[^:\s]+$/.test(credentials)) {
  console.error(
    "HF_CREDENTIALS is missing or not in key-id:key-secret format. Add it to .env.local.",
  );
  process.exit(1);
}
config({ credentials });

const API = "https://api.higgsfield.ai";
// The SDK's own polling only stops on completed, nsfw and failed, so a
// canceled request would spin until its timeout. Poll every terminal status.
const TERMINAL = new Set([
  "completed",
  "nsfw",
  "failed",
  "canceled",
  "cancelled",
]);
const POLL_MS = 3000;
const MAX_WAIT_MS = 15 * 60 * 1000;

type Status = {
  status: string;
  request_id: string;
  video?: { url?: string };
};

async function waitForResult(requestId: string): Promise<Status> {
  const started = Date.now();
  while (Date.now() - started < MAX_WAIT_MS) {
    const res = await fetch(
      `${API}/requests/${encodeURIComponent(requestId)}/status`,
      {
        headers: { Authorization: `Key ${credentials}` },
      },
    );
    if (res.ok) {
      const body = (await res.json()) as Status;
      if (TERMINAL.has(String(body.status))) return body;
    } else if (res.status < 500) {
      throw new Error(`status check returned HTTP ${res.status}`);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  throw new Error(`no final status after ${MAX_WAIT_MS / 60000} minutes`);
}

try {
  const queued = await higgsfield.subscribe(MODEL, {
    input: {
      prompt: "A cinematic scene at sunset",
      duration: 5,
      resolution: "720p",
      aspect_ratio: "16:9",
    },
    withPolling: false,
  });
  const result = TERMINAL.has(String(queued.status))
    ? (queued as Status)
    : await waitForResult(queued.request_id);
  // Only "completed" with a URL counts as success.
  const status = String(result.status);
  const url = result.video?.url;
  if (status === "completed" && url) {
    console.log(`Video ready (request ${result.request_id}): ${url}`);
  } else {
    const why =
      status === "nsfw"
        ? "was blocked by moderation"
        : status === "completed"
          ? "completed without a video URL"
          : `ended with status "${status}"`;
    console.error(`Generation ${why} (request ${result.request_id}).`);
    process.exitCode = 1;
  }
} catch (e) {
  // Errors carry the HTTP status and the API's message, never the key.
  console.error(
    `Higgsfield request failed: ${e instanceof Error ? `${e.name}: ${e.message}` : String(e)}`,
  );
  process.exitCode = 1;
}
