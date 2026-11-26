import { supabase } from "@/integrations/supabase/client";
import { requireTenantId } from "@/lib/requireTenantId";
import {
  type CarmenChoices,
  NO_CHOICES,
  readChoiceCache,
  writeChoiceCache,
} from "./carmenChoiceCache";

/** Whose picks a read or write is about. */
export interface ChoiceScope {
  tenantId: string | null;
  /** The signed-in user. */
  userId: string | null;
  /**
   * The colleague a "view as" session previews, else null. Picks made there
   * last for the session only, apart for each colleague, and reach no row.
   */
  viewAsUserId: string | null;
}

/** The picks as the query holds them. */
export interface ChoicesState extends CarmenChoices {
  /** True once the server reported the row; false for the cache or a pick shown before any answer. */
  answered: boolean;
}

/** One changed pick, named by its carmen_user_choices column. */
export type CarmenChoicePatch =
  { brain_slug: string | null } | { voice: string | null };

/** One pick on its way to the row, with the scope it was made in. */
export interface ChoiceWrite {
  scope: ChoiceScope;
  patch: CarmenChoicePatch;
}

/**
 * The carmen_user_choices row that holds the scope's picks, or null when no
 * row does: in "view as", and before the org and the user are known.
 */
export function storedRow({
  tenantId,
  userId,
  viewAsUserId,
}: ChoiceScope): { tenantId: string; userId: string } | null {
  return tenantId && userId && !viewAsUserId ? { tenantId, userId } : null;
}

/** One entry per org and user; "view as" keeps one more for each colleague viewed. */
export function carmenChoicesKey({
  tenantId,
  userId,
  viewAsUserId,
}: ChoiceScope) {
  return [
    "carmen-choices",
    tenantId,
    userId,
    viewAsUserId ? `session:${viewAsUserId}` : "stored",
  ];
}

/** The user's stored picks in the org; a user without a row has picked nothing. */
export async function loadCarmenChoices(
  tenantId: string,
  userId: string,
): Promise<ChoicesState> {
  const { data, error } = await supabase
    .from("carmen_user_choices")
    .select("brain_slug, voice")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    // The caller falls back to the cached picks, so this is the only trace.
    console.error("[carmenChoiceQueries] the picks were not read", error);
    throw error;
  }

  return {
    brainSlug: data?.brain_slug ?? null,
    voice: data?.voice ?? null,
    answered: true,
  };
}

/**
 * Stores one pick on the user's own row (RLS allows no other row). Only the
 * changed column is sent, so saving the brain never overwrites the voice.
 */
export async function saveCarmenChoice(
  tenantId: string | null,
  patch: CarmenChoicePatch,
): Promise<void> {
  const { error } = await supabase
    .from("carmen_user_choices")
    .upsert(
      { tenant_id: requireTenantId(tenantId), ...patch },
      { onConflict: "tenant_id,user_id" },
    );
  if (error) {
    throw error;
  }
}

/** The picks as they read once the patch is stored. */
export function withChoicePatch<T extends CarmenChoices>(
  choices: T,
  patch: CarmenChoicePatch,
): T {
  return "voice" in patch
    ? { ...choices, voice: patch.voice }
    : { ...choices, brainSlug: patch.brain_slug };
}

/**
 * The picks to show for the scope: what the query holds, else this browser's
 * cached copy of the row, else none.
 */
export function shownChoices(
  scope: ChoiceScope,
  held: ChoicesState | undefined,
): ChoicesState {
  if (held) {
    return held;
  }

  const row = storedRow(scope);
  const cached = row ? readChoiceCache(row.tenantId, row.userId) : null;
  return { ...(cached ?? NO_CHOICES), answered: false };
}

/** Keeps the browser's cache equal to the picks the query holds for the row. */
export function rememberChoices(
  scope: ChoiceScope,
  held: CarmenChoices | undefined,
): void {
  const row = storedRow(scope);
  if (held && row) {
    writeChoiceCache(row.tenantId, row.userId, held);
  }
}
