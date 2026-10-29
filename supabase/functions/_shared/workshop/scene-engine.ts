/**
 * The video engines a film scene can be animated on, and the clip lengths each one renders.
 */

export type SceneEngine =
  "mock" | "kling" | "elevenlabs" | "higgsfield" | "openrouter";

export const ENGINE_LABEL: Record<SceneEngine, string> = {
  mock: "חינם — תצוגה",
  kling: "Kling",
  elevenlabs: "ElevenLabs",
  higgsfield: "Higgsfield",
  openrouter: "OpenRouter (Kling 3)",
};

export const isSceneEngine = (value: unknown): value is SceneEngine =>
  value === "mock" ||
  value === "kling" ||
  value === "elevenlabs" ||
  value === "higgsfield" ||
  value === "openrouter";

/** The clip length the engine renders for a scene planned at `duration` seconds. */
export function sceneClipSeconds(engine: SceneEngine, duration: number) {
  if (engine === "elevenlabs") {
    const seconds = Number(duration) || 5;
    return seconds <= 4 ? 4 : seconds <= 6 ? 6 : 8;
  }
  if (engine === "higgsfield")
    return Math.min(15, Math.max(1, Math.ceil(Number(duration) || 5)));
  // OpenRouter's default video model, Kling v3, renders 3 to 15 s.
  if (engine === "openrouter")
    return Math.min(15, Math.max(3, Math.ceil(Number(duration) || 5)));
  return Number(duration) > 5 ? 10 : 5;
}

/** Engines whose clip speaks the line itself (Veo 3.1, Seedance 2.5), so no lip-sync pass. */
export const speaksNatively = (engine: SceneEngine) =>
  engine === "elevenlabs" || engine === "higgsfield" || engine === "openrouter";

/** Connections outside the LLM integration settings that can make video. */
export interface VideoConnections {
  /** The tenant connected OpenRouter as a Carmen brain (existence only; no key here). */
  openrouter?: boolean;
}
