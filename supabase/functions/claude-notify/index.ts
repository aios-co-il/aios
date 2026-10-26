// claude-notify — lets Claude (running in a routine session) and Carmen's
// pulse / health jobs push a WhatsApp update to the human, independent of
// Carmen's live session.
//
// Recipient: explicit chat_id / campaign_pulse_phone / tenant campaigner —
// never a cross-tenant owner who merely has the newest session, never a group
// chat. Always 1:1.
//
// Transport: Carmen's own line, and only a PRIMARY Carmen connection (a
// secondary one, e.g. the owner's personal phone, never sends system
// notifications). The tenant's Carmen send_manus_message step is used whenever
// it resolves to an active, primary manus_wa line; a Green API step (David's
// operator phone) is only a labelled fallback (transport: "green_fallback" +
// console.warn) when no Manus step does.
// The response carries the real send result: { sent, status, transport, error }.
//
// Auth (fails closed): Authorization: Bearer must be CLAUDE_MCP_BEARER (same
// shared secret as claude-mcp, used by the claude_notify_david() SQL function)
// or this project's service-role key. With CLAUDE_MCP_BEARER unset only the
// service-role key is accepted.
//
// Body: { tenant_id, message, chat_id? } or { ping: true, tenant_id? }.
// Ping reports, per tenant, which step type and line a send would use, the
// line's Carmen role and whether the Manus integration is active. It sends
// nothing.
//
// Logic lives in ../_shared/claude-notify-core.ts (unit tested).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { createClaudeNotifyHandler } from "../_shared/claude-notify-core.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

Deno.serve(
  createClaudeNotifyHandler({
    supabaseUrl: SUPABASE_URL,
    serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
    bearerSecret: Deno.env.get("CLAUDE_MCP_BEARER") ?? null,
    createSupabase: () =>
      createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false },
      }),
  }),
);
