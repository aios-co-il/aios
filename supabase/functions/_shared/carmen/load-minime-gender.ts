import type { DbClient } from "../supabase-clients.ts";
import { toAddressGender } from "./address-gender.ts";
import { type MiniMeGender, resolveMiniMeGender } from "./minime-gender.ts";

/**
 * A user's Mini Me set by the site's rule (`resolveMiniMeGender`), read from
 * their profile; male for no user or an unreadable profile, which is logged.
 */
export async function loadMiniMeGender(
  db: Pick<DbClient, "from">,
  userId: string | null,
): Promise<MiniMeGender> {
  if (!userId) {
    return resolveMiniMeGender(null, null);
  }
  const { data, error } = await db
    .from("profiles")
    .select("minime_gender, gender")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    console.error("[minime-gender] profile lookup failed", error.message);
  }
  return resolveMiniMeGender(
    data?.minime_gender,
    toAddressGender(data?.gender),
  );
}
