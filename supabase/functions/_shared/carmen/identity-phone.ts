import {
  digitsOnly,
  looksLikeRealPhone,
  MAX_PHONE_DIGITS,
} from "../carmen-private-routing.ts";

type LidMapReader = {
  from(table: "wa_lid_map"): {
    select(columns: "phone"): {
      eq(
        column: "lid",
        value: string,
      ): {
        maybeSingle(): PromiseLike<{
          data: { phone?: unknown } | null;
          error: { message: string } | null;
        }>;
      };
    };
  };
};

/**
 * The phone Carmen checks a WhatsApp author against, or "" when there is none.
 *
 * A long WhatsApp LID can end in nine digits that look like an Israeli mobile
 * (224686986293269 → 986293269), so the tail alone never makes it a phone.
 * A LID that `wa_lid_map` does not know resolves to "" (the caller answers
 * "unresolved author") instead of being matched by its tail against
 * `carmen_whatsapp_identities`; so does a LID whose lookup fails, after the
 * error is logged. A shorter number that is not Israeli-shaped
 * (a foreign phone) is kept as it is.
 */
export async function resolveCarmenIdentityPhone(
  supabase: LidMapReader,
  phoneNumber: string,
): Promise<string> {
  const digits = digitsOnly(phoneNumber);
  if (!digits || looksLikeRealPhone(digits)) {
    return digits;
  }
  const { data: known, error } = await supabase
    .from("wa_lid_map")
    .select("phone")
    .eq("lid", digits)
    .maybeSingle();
  if (error) {
    // Unresolved, not matched by its tail: the caller answers "unresolved author".
    console.error("[carmen] wa_lid_map lookup failed", {
      lid: digits,
      error: error.message,
    });
    return "";
  }
  const knownPhone = digitsOnly(known?.phone);
  if (knownPhone && knownPhone.length <= MAX_PHONE_DIGITS) {
    return knownPhone;
  }
  return digits.length > MAX_PHONE_DIGITS ? "" : digits;
}
