// The handler's dependencies in production: requireAuth, Telegram's getMe and
// a client that acts as the caller.
import { requireAuth } from "../_shared/security.ts";
import { userClient } from "../_shared/supabase-clients.ts";
import type { BotInfo, VerifyBotDeps } from "./handler.ts";

const TELEGRAM_API = "https://api.telegram.org";

/** VerifyBotDeps over the network and the caller's JWT. */
export function liveVerifyBotDeps(): VerifyBotDeps {
  return {
    authenticate: requireAuth,
    fetchBot: (botToken) => fetchBot(fetch, botToken),
    saveBot: async (authHeader, row) => {
      // The conflict target is telegram_bot_state_tenant_source_unique (NULLS
      // NOT DISTINCT): ON CONFLICT cannot infer a partial unique index.
      const { error } = await userClient(authHeader)
        .from("telegram_bot_state")
        .upsert(row, { onConflict: "tenant_id,shared_from_state_id" });
      return error
        ? { code: error.code ?? null, message: error.message }
        : null;
    },
  };
}

/** getMe: the bot the token belongs to, or null when Telegram refuses it. */
async function fetchBot(
  fetcher: typeof fetch,
  botToken: string,
): Promise<BotInfo | null> {
  const response = await fetcher(`${TELEGRAM_API}/bot${botToken}/getMe`);
  const reply: {
    ok?: boolean;
    result?: { username?: string; first_name?: string };
  } = await response.json();
  if (!response.ok || !reply.ok) {
    return null;
  }
  return {
    username: reply.result?.username ?? null,
    firstName: reply.result?.first_name ?? null,
  };
}
