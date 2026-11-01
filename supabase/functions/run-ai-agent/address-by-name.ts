import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import type { Database } from "../_shared/database.types.ts";

/**
 * The prompt line that tells Carmen who she is talking to and how to address them. Hebrew marks
 * gender in every verb, and with no rule she wrote to David in the feminine ("תעלי"). The model
 * reads the gender from the first name; a name that does not show one gets the plural.
 */
export function addressByNameLine(fullName: string | null | undefined) {
  const name = (fullName ?? "").trim();
  if (!name) {
    return null;
  }
  return `\n\n🙋 **פנייה למשתמש:** את מדברת עם ${name}. פני אליו או אליה בלשון שמתאימה לשם הפרטי: לשון זכר לשם של גבר, לשון נקבה לשם של אישה. כשהשם לא מעיד על מגדר, פני בלשון רבים.`;
}

/** The signed-in caller's name from their profile, when the turn did not bring one. */
export async function callerProfileName(
  db: SupabaseClient<Database>,
  userId: string | null,
): Promise<string | null> {
  if (!userId) {
    return null;
  }
  const { data, error } = await db
    .from("profiles")
    .select("full_name")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    console.error("[AGENT] caller name lookup failed", error.message);
    return null;
  }
  return data?.full_name ?? null;
}
