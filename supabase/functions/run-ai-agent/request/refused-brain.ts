import { corsHeaders } from "../runtime.ts";

/**
 * The answer when the picked brain may not run as Carmen (not approved for
 * client data, or not set up): Carmen says why, instead of a bare error.
 */
export function refusedBrainResponse(
  message: string,
  wantStream: boolean,
): Response {
  if (!wantStream) {
    return new Response(
      JSON.stringify({ success: false, output: message, error: message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
  const sse = [
    { type: "token", content: message },
    { type: "done", success: false, output: message, error: message },
  ]
    .map((e) => `data: ${JSON.stringify(e)}\n\n`)
    .join("");
  return new Response(sse, {
    headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
  });
}
