import { supabase } from "@/integrations/supabase/client";
import { mergePersonas } from "./carmenPersonas";
import type { SaveInput } from "./useCarmenPersonas";

/** The org's characters as the user sees them (RLS hides colleagues' own). */
export async function loadPersonas(tenantId: string) {
  const { data, error } = await supabase
    .from("carmen_personas")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at");
  if (error) {
    throw error;
  }
  return mergePersonas(data);
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
 * Updates a stored character, stores the org's first edit of a built-in, or
 * creates a new character for the org or for the user.
 */
export async function savePersona(
  tenantId: string | null,
  userId: string | null,
  { persona, draft, audience }: SaveInput,
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
  const { error } = persona?.rowId
    ? await supabase
        .from("carmen_personas")
        .update(fields)
        .eq("id", persona.rowId)
    : await supabase.from("carmen_personas").insert({
        ...fields,
        tenant_id: tenantId,
        builtin_key: persona?.builtinKey ?? null,
        owner_user_id: !persona && audience === "me" ? userId : null,
      });
  if (error) {
    throw error;
  }
}

/** Removes a created character, or an org's edit of a built-in (back to its defaults). */
export async function deletePersona(rowId: string) {
  const { error } = await supabase
    .from("carmen_personas")
    .delete()
    .eq("id", rowId);
  if (error) {
    throw error;
  }
}
