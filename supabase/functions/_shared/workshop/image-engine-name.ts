/**
 * The engine id behind a name a user or Carmen gives for an image engine.
 */

import { type ImageProvider } from "./image-providers.ts";

/** Names a user or model may use for an engine, mapped to the engine's id. */
export function normalizeEngine(value: unknown): ImageProvider | null {
  if (typeof value !== "string") return null;
  const name = value.toLowerCase().replace(/[\s_.-]+/g, "");
  if (!name) return null;
  if (/eleven|11labs|לאבז|לאבס|אילו/.test(name)) return "elevenlabs";
  if (/google|gemini|nano|banana|גוגל|ג'מיני|גמיני/.test(name)) return "google";
  if (/higgs|היג|היגס/.test(name)) return "higgsfield";
  if (/openai|gpt|אופןאיי|אופנאיי/.test(name)) return "openai";
  return null;
}
