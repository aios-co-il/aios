import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import type { Database } from "../_shared/database.types.ts";
import { type AddressGender, toAddressGender } from "./address-gender.ts";

/** The caller's profile fields that shape how Carmen addresses them. */
export interface CallerProfile {
  fullName: string | null;
  gender: AddressGender;
}

const ADDRESS_RULE: Record<"male" | "female" | "unknown", string> = {
  male: 'פני אליו בלשון זכר ("תבחר", "אתה רוצה").',
  female: 'פני אליה בלשון נקבה ("תבחרי", "את רוצה").',
  unknown:
    'המגדר לא ידוע: פני בלשון רבים או ניטרלית ("אפשר לבחור", "בחרו", "רוצים"). אסור לפנות בלשון נקבה או זכר יחיד, וגם לא לנחש מהשם.',
};

/**
 * The prompt line that tells Carmen how to address the user. Hebrew marks gender in every verb,
 * and the prompt is full of feminine imperatives meant for Carmen herself, so with no explicit
 * rule (or a guess from the name) she wrote to men in the feminine ("תעלי"). The profile's
 * gender decides; unknown is the plural. Always returned, also without a name.
 */
export function userAddressLine(
  fullName: string | null | undefined,
  gender: AddressGender,
): string {
  const name = (fullName ?? "").trim();
  const who = name ? `את מדברת עם ${name}. ` : "";
  return `\n\n🙋 **פנייה למשתמש:** ${who}${ADDRESS_RULE[gender ?? "unknown"]} ההוראות בלשון נקבה בפרומפט מופנות אלייך, כרמן, לא למשתמש.`;
}

/** The signed-in caller's name and address gender from their profile. */
export async function callerProfile(
  db: SupabaseClient<Database>,
  userId: string | null,
): Promise<CallerProfile> {
  if (!userId) {
    return { fullName: null, gender: null };
  }
  const { data, error } = await db
    .from("profiles")
    .select("full_name, gender")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    console.error("[AGENT] caller profile lookup failed", error.message);
    return { fullName: null, gender: null };
  }
  return {
    fullName: data?.full_name ?? null,
    gender: toAddressGender(data?.gender),
  };
}
