/**
 * What the browser and the engine resolvers share about a run-ai-agent body
 * and the brain it runs on. A surface without a brain picker sends
 * `use_brain_pick: true` to run on the brain the user stored per organization
 * (carmen_user_choices.brain_slug, read in run-ai-agent/stored-brain-pick.ts).
 * This file imports nothing: the frontend imports the flag name from it, and
 * any import that loads esm.sh or reads Deno.env would break its build.
 */

/** The run-ai-agent body field that asks for the caller's stored pick. */
export const USE_BRAIN_PICK = "use_brain_pick";

/**
 * Whether the request names a brain itself. Carmen's own ("internal") counts:
 * a brain the user picked for this turn wins over a default and a stored pick.
 */
export function namesBrain(body: { brain_slug?: unknown }): boolean {
  return typeof body.brain_slug === "string" && body.brain_slug !== "";
}
