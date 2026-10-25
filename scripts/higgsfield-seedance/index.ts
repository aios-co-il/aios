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

try {
  const result = await higgsfield.subscribe(MODEL, {
    input: {
      prompt: "A cinematic scene at sunset",
      duration: 5,
      resolution: "720p",
      aspect_ratio: "16:9",
    },
    withPolling: true,
  });
  // The SDK types list queued, in_progress, completed, failed and nsfw; the
  // API can also end a request as canceled. Only "completed" with a URL counts.
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
  // SDK errors carry the HTTP status and the API's message, never the key.
  console.error(
    `Higgsfield request failed: ${e instanceof Error ? `${e.name}: ${e.message}` : String(e)}`,
  );
  process.exitCode = 1;
}
