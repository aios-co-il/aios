// claude-notify edge function; the request flow is documented in handler.ts.
import { serviceClient } from "../_shared/supabase-clients.ts";
import { createClaudeNotifyHandler } from "./handler.ts";

Deno.serve(
  createClaudeNotifyHandler({
    supabaseUrl: Deno.env.get("SUPABASE_URL") ?? "",
    serviceRoleKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    bearerSecret: Deno.env.get("CLAUDE_MCP_BEARER") ?? null,
    createSupabase: serviceClient,
  }),
);
