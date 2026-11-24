import type { ChannelAttachment, ChannelProvider } from "./types.ts";
import { publicApiUrl } from "../public-api/url.ts";

export function aiosEnvironmentLabel(): "staging" | "production" {
  const env = String(
    Deno.env.get("APP_ENV") || Deno.env.get("VITE_APP_ENV") || "",
  ).toLowerCase();
  return env === "staging" ? "staging" : "production";
}

export function agentChannelMcpConnectionName(
  env?: "staging" | "production",
): string {
  return (env ?? aiosEnvironmentLabel()) === "staging"
    ? "AIOS Agent Channel — Staging"
    : "AIOS Agent Channel — Production";
}

export function supabaseProjectRef(): string {
  const url =
    typeof Deno === "undefined"
      ? ""
      : String(Deno.env.get("SUPABASE_URL") || "");
  return url.match(/^https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1] || "";
}

/** Official Workspace Agent API input for Codex Direct (async trigger + MCP reply). */
export function buildCodexWorkspaceAgentInput(args: {
  userText: string;
  conversationId: string;
  sessionId: string;
  tenantId: string;
  environment?: "staging" | "production";
  parliamentRound?: number | null;
  attachments?: Array<ChannelAttachment>;
  projectRef?: string;
}): string {
  const env = args.environment ?? aiosEnvironmentLabel();
  const mcp = agentChannelMcpConnectionName(env);
  const projectRef = args.projectRef ?? supabaseProjectRef();
  const roundLine =
    args.parliamentRound != null
      ? `parliament_round: ${args.parliamentRound}\n`
      : "";
  return (
    `[AIOS Command Center · Codex Direct]\n\n` +
    `You are AIOS Codex Direct. Complete the user's task in the Workspace and return the complete result to AIOS.\n\n` +
    `Answer it yourself. Do not forward it to Cursor, Carmen, or another agent.\n\n` +
    `User request:\n${String(args.userText || "").trim() || "(no text — see attached files)"}` +
    `${attachmentBlock(args.attachments)}\n\n` +
    `--- AIOS DELIVERY METADATA ---\n` +
    `conversation_id: ${args.conversationId}\n` +
    `session_id: ${args.sessionId}\n` +
    `origin: codex\n` +
    `tenant_id: ${args.tenantId}\n` +
    roundLine +
    `environment: ${env}\n` +
    (projectRef ? `supabase_project_ref: ${projectRef}\n` : "") +
    `\nAIOS_ENVELOPE_JSON: ${JSON.stringify({
      conversation_id: args.conversationId,
      session_id: args.sessionId,
      origin: "codex",
      tenant_id: args.tenantId,
      environment: env,
      supabase_project_ref: projectRef || null,
      mcp_connection: mcp,
      parliament_round: args.parliamentRound ?? null,
    })}\n\n` +
    `--- REQUIRED DELIVERY ---\n` +
    `When the task is complete, call reply_to_aios_session exactly once with:\n` +
    `- conversation_id from above\n` +
    `- session_id from above\n` +
    `- origin from above\n` +
    `- tenant_id from above\n` +
    `- content containing the complete answer to the user\n` +
    `- a unique idempotency_key\n` +
    (args.parliamentRound != null ? `- parliament_round when supplied\n` : "") +
    `\nBecause this is ${env === "production" ? "Production" : "Staging"}, use only ${mcp}.\n` +
    `Do not return secrets, callback tokens, environment variables, or authentication headers.\n` +
    `Do not send the same answer to both Staging and Production MCP connections.\n`
  );
}

function attachmentBlock(
  attachments: Array<ChannelAttachment> | undefined,
): string {
  if (!attachments?.length) return "";
  const lines = attachments.map((a) => {
    const label = a.type === "image" ? "image" : "file";
    return `- ${label}: ${a.name} → ${a.url}`;
  });
  return `\n\nAttached files (${attachments.length}):\n${lines.join("\n")}\n`;
}

export function buildCallbackInstructions(args: {
  origin: ChannelProvider;
  conversationId: string;
  sessionId: string;
  tenantId: string;
  token: string;
  parliamentRound?: number;
  readOnly?: boolean;
  callbackIntent?: "default" | "meeting_summary";
}): string {
  const supabaseUrl = publicApiUrl();
  const roundLine = args.parliamentRound
    ? `This is parliament round ${args.parliamentRound}. Do not open another parliament.\n`
    : "";
  const ro = args.readOnly
    ? `READ-ONLY: do not open PRs, edit production, deploy, or write data. Analysis only.\n`
    : "";
  const workspaceDelivery =
    args.origin === "codex" || args.origin === "chatgpt"
      ? `For Codex/ChatGPT Workspace: deliver via the HTTP POST below (same Supabase project that dispatched you). ` +
        `Do NOT use MCP reply_to_aios_session unless that MCP server's URL is exactly ${supabaseUrl}.\n`
      : "";
  return (
    `\n\n--- DELIVER THE ANSWER BACK TO AIOS (required) ---\n` +
    `You are talking to the user through Carmen's Command Center. When you finish, ` +
    `return the full answer into the same AIOS conversation. Do NOT call ask_carmen or ask_cursor to deliver it.\n` +
    workspaceDelivery +
    roundLine +
    ro +
    `conversation_id: ${args.conversationId}\n` +
    `session_id: ${args.sessionId}\n` +
    `origin: ${args.origin}\n` +
    `tenant_id: ${args.tenantId}\n\n` +
    (args.callbackIntent === "meeting_summary"
      ? `MEETING SUMMARY: do not edit the repository, do not open a pull request, and do not add a preview URL. ` +
        `The content you send back must be only the Hebrew Markdown meeting summary.\n\n`
      : `When you changed code, your answer MUST include the Vercel Preview URL for this branch and the PR (or merge) link ` +
        `so the user can verify before production publish.\n\n`) +
    `Preferred: call MCP tool reply_to_aios_session with those ids and content=<your full answer>, ` +
    `plus a one-time idempotency_key.\n\n` +
    (workspaceDelivery
      ? ""
      : `On work that takes more than a few minutes, call MCP tool publish_aios_progress with the same ids ` +
        `and a one-line status every few steps. It does not end your turn.\n` +
        `To return a file you made (image, video, audio, document), call MCP tool upload_aios_file, ` +
        `PUT the bytes to its upload_url, and list its path in attachments of reply_to_aios_session.\n\n`) +
    `Fallback HTTP POST ${supabaseUrl}/functions/v1/agent-channel-callback\n` +
    `Headers:\n` +
    `  Authorization: Bearer ${args.token}\n` +
    `  Content-Type: application/json\n` +
    `  Idempotency-Key: <same key>\n` +
    `Body JSON: { "conversation_id": "${args.conversationId}", "session_id": "${args.sessionId}", ` +
    `"origin": "${args.origin}", "tenant_id": "${args.tenantId}", "content": "<full answer>" }\n`
  );
}

/** The Command Center sidecar's screen context, as JSON the session can read; "" for anything else. */
function screenContextBlock(screenContext: unknown): string {
  if (
    !screenContext ||
    typeof screenContext !== "object" ||
    !("source" in screenContext) ||
    screenContext.source !== "command_center_sidebar"
  ) {
    return "";
  }
  return (
    `\n\nThe screen the user is looking at in AIOS:\n` +
    `${JSON.stringify(screenContext).slice(0, SCREEN_CONTEXT_MAX)}\n`
  );
}

/** Enough for the path, ids and page title; the sidecar's context is small. */
const SCREEN_CONTEXT_MAX = 2000;

/**
 * The task as a direct brain reads it. `opening` replaces the default identity lines: Claude
 * Direct opens a new session with Carmen's identity and a follow-up with none, since the open
 * session already has it.
 */
export function wrapDirectPrompt(args: {
  origin: ChannelProvider;
  userText: string;
  history: Array<{ role: string; content: string }>;
  attachments?: Array<ChannelAttachment>;
  opening?: string;
  /** Command Center sidecar context, unvalidated from the browser. */
  screenContext?: unknown;
}): string {
  const hist = args.history
    .slice(-12)
    .map((m) => `${m.role}: ${String(m.content || "").slice(0, 1500)}`)
    .join("\n");
  const who =
    args.origin === "cursor"
      ? "Cursor Direct"
      : args.origin === "grok"
        ? "Grok Bot Direct"
        : args.origin === "codex"
          ? "Codex Direct (ChatGPT Workspace)"
          : args.origin === "claude"
            ? "Claude Direct"
            : args.origin === "chatgpt"
              ? "ChatGPT Work Agent"
              : args.origin;
  const opening =
    args.opening ??
    `[AIOS Command Center · ${who}]\n` +
      `You are the selected brain for this Carmen conversation. Answer David directly.\n` +
      `Reply in the user's language. Be concrete.\n\n`;
  return (
    opening +
    (hist ? `Recent thread:\n${hist}\n\n` : "") +
    `User:\n${args.userText}\n` +
    attachmentBlock(args.attachments) +
    screenContextBlock(args.screenContext)
  );
}
