import { supabase } from "@/integrations/supabase/client";
import { mergePersonas, saveTarget } from "./carmenPersonas";
import type { SaveInput } from "./useCarmenPersonas";

/** The org's characters as the user sees them (RLS hides colleagues' own). */
export async function loadPersonas(tenantId: string, userId: string) {
  const { data, error } = await supabase
    .from("carmen_personas")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at");
  if (error) {
    throw error;
  }
  return mergePersonas(data, userId);
}

/** The user's picked character key, or null when they have not picked one. */
export async function loadChoice(tenantId: string, userId: string) {
  const { data, error } = await supabase
    .from("carmen_persona_choices")
    .select("persona_key")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    throw error;
  }
  return data?.persona_key ?? null;
}

/** Records the user's pick; RLS lets a user write only their own row. */
export async function saveChoice(tenantId: string | null, key: string) {
  if (!tenantId) {
    throw new Error("No organization selected");
  }
  const { error } = await supabase.from("carmen_persona_choices").upsert(
    { tenant_id: tenantId, persona_key: key },
    {
      onConflict: "tenant_id,user_id",
    },
  );
  if (error) {
    throw error;
  }
}

/**
 * Saves a character: the user's own row is updated, anything else becomes their
 * own version, and only an owner or super admin saves for the org (RLS checks it).
 */
export async function savePersona(
  tenantId: string | null,
  userId: string | null,
  { persona, draft, forOrg }: SaveInput,
) {
  if (!tenantId || !userId) {
    throw new Error("No organization selected");
  }
  const fields = {
    display_name: draft.displayName.trim(),
    call_words: draft.callWords,
    intro_line: draft.introLine.trim() || null,
    look: draft.look,
    mood: draft.mood,
    personality: draft.personality.trim() || null,
    soul: draft.soul.trim() || null,
    writing_style: draft.writingStyle || null,
  };
  const target = saveTarget(persona, forOrg, userId);
  const { error } =
    target.kind === "update"
      ? await supabase
          .from("carmen_personas")
          .update(fields)
          .eq("id", target.rowId)
      : await supabase.from("carmen_personas").insert({
          ...fields,
          tenant_id: tenantId,
          builtin_key: target.builtinKey,
          owner_user_id: target.ownerUserId,
        });
  if (error) {
    throw error;
  }
}

/** Removes a stored row: a created character, or an edit of a built-in (it falls back a level). */
export async function deletePersona(rowId: string) {
  const { error } = await supabase
    .from("carmen_personas")
    .delete()
    .eq("id", rowId);
  if (error) {
    throw error;
  }
}
