// One bot connect: the caller, the request, the token with Telegram, then the
// save as the caller. Dependencies are injected so these steps are tested at
// this seam (handler.test.ts) without Telegram or a database.
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2/cors";

/** The bot a token belongs to, as Telegram's getMe reports it. */
export type BotInfo = { username: string | null; firstName: string | null };

/** The tenant's own bot row (not a shared copy), as this function writes it. */
export type BotRow = {
  tenant_id: string;
  shared_from_state_id: null;
  bot_username: string | null;
  bot_name: string | null;
  is_active: boolean;
  update_offset: number;
  updated_at: string;
};

/** A refused or failed save: the Postgres error code and message. */
export type SaveError = { code: string | null; message: string };

export type VerifyBotDeps = {
  authenticate(
    req: Request,
  ): Promise<{ kind: "user" | "service"; userId: string | null } | null>;
  /** Telegram's getMe for the token; null when Telegram refuses it. */
  fetchBot(botToken: string): Promise<BotInfo | null>;
  /** Upserts the row with the caller's JWT, so RLS decides who may write. */
  saveBot(authHeader: string, row: BotRow): Promise<SaveError | null>;
};

/** Postgres refuses a write that row-level security does not allow with 42501. */
const RLS_REFUSAL = "42501";

/**
 * Saves the tenant's bot once the caller is a signed-in user and Telegram
 * accepts the token. The save runs as the caller, so the owner policies of
 * telegram_bot_state refuse anyone but the owner of that active tenant or a
 * super admin acting in it.
 */
export async function handleVerifyBot(
  req: Request,
  deps: VerifyBotDeps,
): Promise<Response> {
  try {
    const authHeader = req.headers.get("Authorization");
    const caller = await deps.authenticate(req);
    if (!authHeader || caller?.kind !== "user") {
      return json({ success: false, error: "Unauthorized" }, 401);
    }
    const request = await readRequest(req);
    if (!request) {
      return json(
        { success: false, error: "bot_token and tenant_id are required" },
        400,
      );
    }
    const bot = await deps.fetchBot(request.botToken);
    if (!bot) {
      return json(
        {
          success: false,
          error: "Bot token verification failed. Check your token.",
        },
        400,
      );
    }
    const saveError = await deps.saveBot(
      authHeader,
      ownBotRow(request.tenantId, bot),
    );
    if (saveError) {
      return saveRefusal(saveError);
    }
    return json({
      success: true,
      bot_name: bot.firstName,
      bot_username: bot.username,
    });
  } catch (error) {
    console.error("telegram-verify-bot error:", error);
    return json({ success: false, error: "Internal error" }, 500);
  }
}

/** The token and tenant from the JSON body, or null when either is missing. */
async function readRequest(
  req: Request,
): Promise<{ botToken: string; tenantId: string } | null> {
  const body: unknown = await req.json().catch(() => null);
  if (typeof body !== "object" || body === null) {
    return null;
  }
  const { bot_token: botToken, tenant_id: tenantId } = body as Record<
    string,
    unknown
  >;
  if (typeof botToken !== "string" || typeof tenantId !== "string") {
    return null;
  }
  if (!botToken.trim() || !tenantId.trim()) {
    return null;
  }
  return { botToken: botToken.trim(), tenantId: tenantId.trim() };
}

/** A fresh connect: active, polling from the start. */
function ownBotRow(tenantId: string, bot: BotInfo): BotRow {
  return {
    tenant_id: tenantId,
    shared_from_state_id: null,
    bot_username: bot.username,
    bot_name: bot.firstName,
    is_active: true,
    update_offset: 0,
    updated_at: new Date().toISOString(),
  };
}

/** 403 when RLS refused the caller; otherwise a logged, generic 500. */
function saveRefusal(error: SaveError): Response {
  if (error.code === RLS_REFUSAL) {
    return json({ success: false, error: "Forbidden" }, 403);
  }
  console.error("telegram-verify-bot save failed:", error);
  return json({ success: false, error: "Internal error" }, 500);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
