import { assertEquals, assertMatch, assertNotMatch } from "jsr:@std/assert@1";
import { buildCodexWorkspaceAgentInput } from "./prompts.ts";

Deno.test("Codex workspace input uses MCP delivery without secrets", () => {
  const input = buildCodexWorkspaceAgentInput({
    userText: "בדיקת codex",
    conversationId: "conv-1",
    sessionId: "sess-1",
    tenantId: "tenant-1",
    environment: "production",
    projectRef: "zvoijyneresvkadpprel",
  });
  assertMatch(input, /\[AIOS Command Center · Codex Direct\]/);
  assertMatch(input, /AIOS Agent Channel — Production/);
  assertMatch(input, /reply_to_aios_session exactly once/);
  assertMatch(input, /conversation_id: conv-1/);
  assertMatch(input, /environment: production/);
  const envelope = JSON.parse(input.match(/AIOS_ENVELOPE_JSON: (.+)/)![1]);
  assertEquals(envelope, {
    conversation_id: "conv-1",
    session_id: "sess-1",
    origin: "codex",
    tenant_id: "tenant-1",
    environment: "production",
    supabase_project_ref: "zvoijyneresvkadpprel",
    mcp_connection: "AIOS Agent Channel — Production",
    parliament_round: null,
  });
  assertNotMatch(input, /Authorization: Bearer/);
  assertNotMatch(input, /agent-channel-callback/);
});

Deno.test("Codex workspace input selects Staging MCP by project ref", () => {
  const input = buildCodexWorkspaceAgentInput({
    userText: "ping",
    conversationId: "c",
    sessionId: "s",
    tenantId: "t",
    environment: "staging",
    parliamentRound: 2,
  });
  assertMatch(input, /AIOS Agent Channel — Staging/);
  assertMatch(input, /environment: staging/);
  assertMatch(input, /parliament_round: 2/);
});

Deno.test(
  "Codex workspace input carries attachments and forbids forwarding",
  () => {
    const input = buildCodexWorkspaceAgentInput({
      userText: "",
      conversationId: "c",
      sessionId: "s",
      tenantId: "t",
      environment: "production",
      attachments: [
        { type: "image", name: "a.png", url: "https://x/a.png" } as any,
      ],
    });
    assertMatch(input, /no text — see attached files/);
    assertMatch(input, /a\.png → https:\/\/x\/a\.png/);
    assertMatch(input, /Do not forward it to Cursor/);
  },
);
