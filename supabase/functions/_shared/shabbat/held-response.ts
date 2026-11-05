import { jerusalemShabbatHoldUntil } from "./quiet-window.ts";

/**
 * A worker's answer while the Shabbat window holds its sends (AIO-226), or
 * null outside the window. The worker claims nothing, so the first run after
 * the window sends each held notification once.
 */
export function shabbatHeldResponse(
  headers: Record<string, string>,
  now: Date = new Date(),
): Response | null {
  const heldUntil = jerusalemShabbatHoldUntil(now);
  if (!heldUntil) {
    return null;
  }
  return new Response(
    JSON.stringify({
      ok: true,
      held: "shabbat",
      hold_until: heldUntil.toISOString(),
      processed: 0,
      results: [],
      errors: [],
    }),
    {
      status: 200,
      headers: { ...headers, "Content-Type": "application/json" },
    },
  );
}
