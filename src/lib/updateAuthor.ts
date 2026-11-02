/**
 * Author line of the update feeds (client card, lead card, pulse call dialog).
 *
 * `profiles.full_name` is empty for many campaigner logins, because nothing
 * fills it when a campaigner gets an account; the name lives on the linked
 * `campaigners` row (`profiles.campaigner_id`). The writer's name is shown
 * before the email, which is only the last resort.
 */

export interface UpdateAuthorCampaigner {
  full_name?: string | null;
}

export interface UpdateAuthorProfile {
  full_name?: string | null;
  email?: string | null;
  campaigners?: UpdateAuthorCampaigner | UpdateAuthorCampaigner[] | null;
}

/** PostgREST embed returning everything `resolveUpdateAuthorName` needs. */
export const UPDATE_AUTHOR_SELECT =
  "profiles:user_id (full_name, email, campaigners:campaigner_id (full_name))";

export const UNKNOWN_UPDATE_AUTHOR = "משתמש";

/** Name to show for an update's writer: profile name, campaigner name, email, then a generic label. */
export function resolveUpdateAuthorName(
  profile?: UpdateAuthorProfile | null,
): string {
  const campaigners = profile?.campaigners;
  const campaigner = Array.isArray(campaigners) ? campaigners[0] : campaigners;

  return (
    nonEmpty(profile?.full_name) ??
    nonEmpty(campaigner?.full_name) ??
    nonEmpty(profile?.email) ??
    UNKNOWN_UPDATE_AUTHOR
  );
}

function nonEmpty(value?: string | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
