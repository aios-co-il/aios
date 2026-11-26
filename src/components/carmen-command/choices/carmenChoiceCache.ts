import { z } from "zod";

/**
 * What a user picked for Carmen in one organization; null means Carmen's
 * default. `brainSlug` is the picked brain's slug (agent_brain_routes.slug)
 * and `voice` the picked voice key: an OpenAI Realtime voice id or an
 * ElevenLabs voice key.
 */
const choicesSchema = z.object({
  brainSlug: z.string().nullable(),
  voice: z.string().nullable(),
});

export type CarmenChoices = z.infer<typeof choicesSchema>;

export const NO_CHOICES: CarmenChoices = { brainSlug: null, voice: null };

/**
 * The picks this browser last knew for the user in the org, or null when it
 * holds none. Only a cache of the server row (carmen_user_choices): shown
 * until the server answers and used when the read fails.
 */
export function readChoiceCache(
  tenantId: string,
  userId: string,
): CarmenChoices | null {
  try {
    const raw = localStorage.getItem(choiceCacheKey(tenantId, userId));
    if (!raw) {
      return null;
    }

    const parsed = choicesSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    // Storage is blocked or holds text that is not JSON: the server row decides.
    return null;
  }
}

/** Remembers the picks on this browser for the next open. */
export function writeChoiceCache(
  tenantId: string,
  userId: string,
  choices: CarmenChoices,
): void {
  try {
    // The schema keeps the two picks and drops whatever else the object holds.
    localStorage.setItem(
      choiceCacheKey(tenantId, userId),
      JSON.stringify(choicesSchema.parse(choices)),
    );
  } catch (error) {
    console.warn("[carmenChoiceCache] the picks were not cached", error);
  }
}

/** One entry per org and user, so a second user or org on this browser reads its own. */
export function choiceCacheKey(tenantId: string, userId: string): string {
  return `aios:carmen-choices:${tenantId}:${userId}`;
}
