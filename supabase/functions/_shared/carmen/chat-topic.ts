/**
 * Names a new chat by its topic. A chat starts titled with its opening
 * message; a small model call then replaces that with a few-word topic, but
 * only while the title is still the provisional one, so a user's rename wins.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { aiChat } from "../ai.ts";
import { cleanTopic } from "./topic-text.ts";

/** Starts topic naming in the background; never throws or delays the reply. */
export function nameChatTopicLater(
  sb: SupabaseClient,
  args: { conversationId: string; firstMessage: string; provisional: string },
): void {
  const job = nameChatTopic(sb, args).catch((e) =>
    console.error("[carmen] chat topic naming failed (non-fatal):", e),
  );
  const runtime = (
    globalThis as {
      EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void };
    }
  ).EdgeRuntime;
  if (runtime?.waitUntil) runtime.waitUntil(job);
}

async function nameChatTopic(
  sb: SupabaseClient,
  args: { conversationId: string; firstMessage: string; provisional: string },
): Promise<void> {
  const topic = cleanTopic(
    await aiChat(
      "Name the topic of this chat in 2-5 words, in the language of the " +
        "message. Reply with the topic only, no quotes or punctuation.\n\n" +
        args.firstMessage.slice(0, 1500),
    ),
  );
  if (!topic) return;
  await sb
    .from("ai_conversations")
    .update({ title: topic })
    .eq("id", args.conversationId)
    .eq("title", args.provisional);
}
