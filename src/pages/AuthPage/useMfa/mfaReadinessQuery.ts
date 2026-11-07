import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Always refresh assurance before deciding whether an account can enter the app. */
export function mfaReadinessQueryOptions(userId: string) {
  return queryOptions({
    queryKey: ["authPage", "mfa", userId],
    queryFn: readRequiredFactor,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
}

/** Unknown assurance or unsupported factors must never authorize navigation. */
async function readRequiredFactor() {
  const { data, error } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error) {
    throw error;
  }
  if (
    !data ||
    !isKnownAssurance(data.currentLevel) ||
    !isKnownAssurance(data.nextLevel)
  ) {
    throw new Error("לא ניתן לבדוק את מצב האימות הדו-שלבי");
  }
  if (data.nextLevel !== "aal2" || data.currentLevel === "aal2") {
    return null;
  }
  const factors = await supabase.auth.mfa.listFactors();
  if (factors.error) {
    throw factors.error;
  }
  const factor = factors.data?.totp[0];
  if (!factor) {
    throw new Error("לא נמצא גורם אימות נתמך");
  }
  return factor.id;
}

/** Only levels recognized by the SDK can authorize completion. */
function isKnownAssurance(level: unknown): level is "aal1" | "aal2" {
  return level === "aal1" || level === "aal2";
}
