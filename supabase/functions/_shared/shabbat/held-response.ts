/** A worker's answer when it claims nothing during the Shabbat quiet window. */
export function shabbatHeldResponse(
  heldUntil: Date,
  headers: Record<string, string>,
): Response {
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
