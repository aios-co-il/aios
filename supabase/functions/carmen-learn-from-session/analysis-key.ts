import { getCaller, getUserOpenAIKey } from "../_shared/userKey.ts";

/** How the analysis key is looked up; injectable so the rule can be tested without the network. */
export type KeyLookup = {
  callerId: (authHeader: string) => Promise<string | null>;
  personalKey: (userId: string) => Promise<string | null>;
};

const liveLookup: KeyLookup = {
  callerId: async (authHeader) => (await getCaller(authHeader))?.id ?? null,
  personalKey: getUserOpenAIKey,
};

/**
 * The OpenAI key to analyze a conversation with. The signed-in owner's personal key comes
 * first, as in the voice session (carmen-realtime-session): it is billed for their own chats,
 * and it is the only working key where the project key is a placeholder (Staging). Anyone
 * else's request, and every WhatsApp session, uses the project key.
 */
export async function analysisKey(
  authHeader: string,
  conversationOwnerId: string | null,
  projectKey: string | null,
  lookup: KeyLookup = liveLookup,
): Promise<string | null> {
  if (conversationOwnerId) {
    const callerId = await lookup.callerId(authHeader);
    if (callerId === conversationOwnerId) {
      const personal = await lookup.personalKey(callerId);
      if (personal) {
        return personal;
      }
    }
  }
  return projectKey;
}
