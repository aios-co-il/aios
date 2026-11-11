import type { SummaryDispatch } from "../_shared/meeting-summary-cursor.ts";

/**
 * The response for a summary Cursor Direct took over, or null when this function
 * should write the summary itself. A failed dispatch is logged and never shown to
 * the user, as in the automatic pipeline: a broken Cursor setup must not block
 * a summary the model can write.
 */
export function cursorSummaryResponse(
  dispatched: SummaryDispatch,
  corsHeaders: Record<string, string>,
): Response | null {
  if (dispatched.ok) {
    return new Response(
      JSON.stringify({
        success: true,
        pending: true,
        channel: "cursor",
        conversation_id: dispatched.conversation_id,
        external_url: dispatched.external_url,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
  if (dispatched.reason !== "not_configured") {
    console.error(
      "[summarize-recording] Cursor Direct summary was not sent; using the model:",
      dispatched.reason,
      dispatched.detail || "",
    );
  }
  return null;
}
