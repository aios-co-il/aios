import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  removeContactTag,
  TAG_REMOVE_REFUSED,
  TagRemoveRefusedError,
  type TaggedContact,
} from "./removeContactTag";

export interface SelectedChat {
  id: string;
  name: string;
  contact_type: "client" | "lead" | "group" | "unknown" | "telegram";
  sender_phone?: string;
}

type TaggableChat = SelectedChat & { contact_type: TaggedContact["type"] };

/** Refused chats named in the error before it switches to a count. */
const NAMED_REFUSALS = 3;

/**
 * Removes a tag from every selected chat that carries it and returns how many
 * lost it. A chat without the tag is skipped, since the bulk menu lists every
 * tag in the tenant. Throws when RLS kept the tag on any chat, naming only
 * those chats, or when a removal failed; the rest are still removed.
 */
export async function removeTagFromChats(
  db: Pick<SupabaseClient<Database>, "from">,
  tenantId: string,
  tagId: string,
  chats: Array<SelectedChat>,
): Promise<number> {
  const taggable = chats.filter(isTaggable);
  const results = await Promise.allSettled(
    taggable.map((chat) =>
      removeContactTag(db, tenantId, tagId, {
        type: chat.contact_type,
        id: chat.id,
        senderPhone: chat.sender_phone,
      }),
    ),
  );
  const refused = taggable.filter((_, i) => isRefusal(results[i]));
  const failed = results.filter(
    (result) => result.status === "rejected" && !isRefusal(result),
  );
  if (refused.length || failed.length) {
    console.error("[chat-tags] bulk remove failed", { refused, failed });
    throw new Error(bulkRemoveError(refused, failed.length));
  }
  return results.filter(
    (result) => result.status === "fulfilled" && result.value === "removed",
  ).length;
}

/** Telegram chats carry no contact tags. */
function isTaggable(chat: SelectedChat): chat is TaggableChat {
  return chat.contact_type !== "telegram";
}

/** Whether RLS kept the tag on this chat. */
function isRefusal(result: PromiseSettledResult<unknown>) {
  return (
    result.status === "rejected" &&
    result.reason instanceof TagRemoveRefusedError
  );
}

/** The toast for a bulk removal that did not reach every chat carrying the tag. */
function bulkRemoveError(refused: Array<SelectedChat>, failedCount: number) {
  const parts: Array<string> = [];
  if (refused.length) {
    const names = refused.slice(0, NAMED_REFUSALS).map((chat) => chat.name);
    const more = refused.length - names.length;
    const named = more ? `${names.join(", ")} ועוד ${more}` : names.join(", ");
    parts.push(
      `התג לא הוסר מ-${refused.length} צ'אטים (${named}): ${TAG_REMOVE_REFUSED}`,
    );
  }
  if (failedCount) {
    parts.push(`שגיאה בהסרת התג מ-${failedCount} צ'אטים`);
  }
  return parts.join(". ");
}
