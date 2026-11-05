import {
  assert,
  assertEquals,
  assertMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import {
  assertWorkspaceAccessToken,
  missingWorkspaceMessage,
  normalizeWorkspaceTriggerId,
  triggerWorkspaceAgentRun,
  validateWorkspaceTriggerId,
  workspaceAgentCreds,
  workspaceAgentTriggerUrl,
  workspaceConversationKey,
} from "./workspace-agent.ts";

Deno.test(
  "Codex reuses the ChatGPT workspace agent when no Codex-specific secrets exist",
  () => {
    const shared = {
      CHATGPT_WORK_AGENT_TRIGGER_ID: "agtch_shared",
      CHATGPT_WORK_AGENT_TOKEN: "tok_shared",
    };
    assertEquals(workspaceAgentCreds("codex", shared), {
      triggerId: "agtch_shared",
      accessToken: "tok_shared",
    });
    assertEquals(workspaceAgentCreds("chatgpt", shared), {
      triggerId: "agtch_shared",
      accessToken: "tok_shared",
    });
  },
);

Deno.test(
  "Codex can pin its own workspace agent without changing ChatGPT Direct",
  () => {
    const env = {
      CHATGPT_WORK_AGENT_TRIGGER_ID: "agtch_chat",
      CHATGPT_WORK_AGENT_TOKEN: "tok_chat",
      CODEX_WORK_AGENT_TRIGGER_ID: "agtch_codex",
      CODEX_WORK_AGENT_TOKEN: "tok_codex",
    };
    assertStrictEquals(
      workspaceAgentCreds("codex", env).triggerId,
      "agtch_codex",
    );
    assertStrictEquals(
      workspaceAgentCreds("chatgpt", env).triggerId,
      "agtch_chat",
    );
  },
);

Deno.test("each Codex chat keeps its own workspace thread key", () => {
  assertStrictEquals(workspaceConversationKey("codex", "c1"), "aios:codex:c1");
  assertStrictEquals(
    workspaceConversationKey("chatgpt", "c1"),
    "aios:chatgpt:c1",
  );
});

Deno.test(
  "validateWorkspaceTriggerId accepts current UUID and legacy trigger ids",
  () => {
    assertStrictEquals(
      validateWorkspaceTriggerId("bd01c76c-0d82-4966-bf48-f4002fb4d4f0"),
      null,
    );
    assertStrictEquals(validateWorkspaceTriggerId("agtch_abc123"), null);
  },
);

Deno.test(
  "validateWorkspaceTriggerId rejects agent ids and malformed trigger ids",
  () => {
    assertMatch(
      validateWorkspaceTriggerId("agt_6a944e6a25c881918c4c0ab") || "",
      /agtch_/,
    );
    assertMatch(validateWorkspaceTriggerId("not-a-trigger"), /UUID/);
  },
);

Deno.test("normalize trigger id and build official trigger URL", () => {
  assertStrictEquals(normalizeWorkspaceTriggerId('"agtch_demo"'), "agtch_demo");
  assertStrictEquals(
    workspaceAgentTriggerUrl("agtch_complaints_123"),
    "https://api.chatgpt.com/v1/workspace_agents/agtch_complaints_123/trigger",
  );
});

Deno.test("assertWorkspaceAccessToken rejects OpenAI Platform sk- keys", () => {
  assertMatch(
    assertWorkspaceAccessToken("sk-proj-abc") || "",
    /Workspace Agent/,
  );
  assertStrictEquals(assertWorkspaceAccessToken("wstok_abc"), null);
});

Deno.test(
  "trigger posts input + conversation_key with the official headers",
  async () => {
    let seen: { url: string; init: RequestInit } | null = null;
    const result = await triggerWorkspaceAgentRun({
      triggerId: "agtch_demo",
      accessToken: "wstok_abc",
      conversationKey: "aios:codex:c1",
      input: "טסט",
      idempotencyKey: "k1",
      fetchImpl: (async (url: string, init: RequestInit) => {
        seen = { url, init };
        return new Response(
          JSON.stringify({
            conversation_url: "https://chatgpt.com/c/1",
            agent_trigger_run_id: "apirun_1",
          }),
          { status: 202 },
        );
      }) as unknown as typeof fetch,
    });
    assertStrictEquals(result.ok, true);
    assert(seen);
    const { url, init } = seen as { url: string; init: RequestInit };
    assertStrictEquals(
      url,
      "https://api.chatgpt.com/v1/workspace_agents/agtch_demo/trigger",
    );
    assertEquals(JSON.parse(String(init.body)), {
      conversation_key: "aios:codex:c1",
      input: "טסט",
    });
    const headers = init.headers as Record<string, string>;
    assertStrictEquals(headers["Idempotency-Key"], "k1");
    assertStrictEquals(headers["OpenAI-Beta"], "workspace_agent_runs=v1");
  },
);

Deno.test("trigger accepts 202 with an empty body", async () => {
  const result = await triggerWorkspaceAgentRun({
    triggerId: "agtch_demo",
    accessToken: "wstok_abc",
    conversationKey: "k",
    input: "x",
    idempotencyKey: "k1",
    fetchImpl: (async () =>
      new Response(null, { status: 202 })) as unknown as typeof fetch,
  });
  assertEquals(result, {
    ok: true,
    status: 202,
    conversationUrl: null,
    runId: null,
  });
});

Deno.test(
  "trigger retries a hung request once with the same Idempotency-Key",
  async () => {
    const keys: string[] = [];
    const result = await triggerWorkspaceAgentRun({
      triggerId: "agtch_demo",
      accessToken: "wstok_abc",
      conversationKey: "k",
      input: "x",
      idempotencyKey: "same",
      timeoutMs: 20,
      fetchImpl: ((_url: string, init: RequestInit) => {
        keys.push((init.headers as Record<string, string>)["Idempotency-Key"]);
        return new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
          );
        });
      }) as unknown as typeof fetch,
    });
    assertStrictEquals(result.ok, false);
    assertEquals(keys, ["same", "same"]);
    if (!result.ok) assertMatch(result.error, /לא ענה/);
  },
);

Deno.test("trigger refuses an empty input", async () => {
  const result = await triggerWorkspaceAgentRun({
    triggerId: "agtch_demo",
    accessToken: "wstok_abc",
    conversationKey: "k",
    input: "  ",
    idempotencyKey: "k1",
    fetchImpl: (() => {
      throw new Error("must not call");
    }) as unknown as typeof fetch,
  });
  assertStrictEquals(result.ok, false);
});

Deno.test(
  "missing Codex workspace copy says Work Mode, not Carmen OpenAI API",
  () => {
    assertMatch(missingWorkspaceMessage("codex"), /Workspace/);
    assertMatch(missingWorkspaceMessage("codex"), /Work Mode/);
    assertMatch(
      missingWorkspaceMessage("codex"),
      /לא את מפתח ה-OpenAI של כרמן/,
    );
  },
);
