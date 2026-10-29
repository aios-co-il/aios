import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";

const EMBEDDING = [0.25, -0.5, 1];

function jsonResponse(body) {
  return new Response(JSON.stringify(body), { status: 200 });
}

let chatContent = null;
let embeddingOk = true;

Deno.env.set("OPENAI_API_KEY", "test-key");
globalThis.fetch = async (url) => {
  if (String(url).endsWith("/embeddings")) {
    return embeddingOk
      ? jsonResponse({ data: [{ embedding: EMBEDDING }] })
      : new Response("{}", { status: 500 });
  }
  if (String(url).endsWith("/chat/completions")) {
    return jsonResponse({ choices: [{ message: { content: chatContent } }] });
  }
  throw new Error(`unexpected fetch ${url}`);
};

const { recallAgentMemory, saveAgentMemory, summarizeAndStoreAgentMemory } =
  await import("./agent-memory.ts");

function fakeClient() {
  const calls = { inserts: [], rpcs: [] };
  const builder = {
    select: () => builder,
    eq: () => builder,
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
    insert: (row) => {
      calls.inserts.push(row);
      return Promise.resolve({ error: null });
    },
  };
  return {
    calls,
    from: () => builder,
    rpc: (name, args) => {
      calls.rpcs.push({ name, args });
      return Promise.resolve({ data: [{ title: "t" }], error: null });
    },
  };
}

const storeOpts = (supabase) => ({
  supabase,
  tenant_id: "tenant",
  agent_id: "agent",
  user_message: "question",
  assistant_output: "answer",
  tools_used: ["search"],
});

Deno.test(
  "summarizeAndStoreAgentMemory stores the embedding as JSON text",
  async () => {
    chatContent = JSON.stringify({
      title: "T",
      summary: "S",
      category: "fact",
      importance: 80,
    });
    embeddingOk = true;
    const client = fakeClient();
    await summarizeAndStoreAgentMemory(storeOpts(client));
    assertStrictEquals(client.calls.inserts.length, 1);
    const row = client.calls.inserts[0];
    assertStrictEquals(typeof row.summary_embedding, "string");
    assertEquals(JSON.parse(row.summary_embedding), EMBEDDING);
    assertStrictEquals(row.category, "fact");
    assertStrictEquals(row.importance, 80);
  },
);

Deno.test(
  "summarizeAndStoreAgentMemory stores null when embedding fails",
  async () => {
    chatContent = JSON.stringify({ title: "T", summary: "S" });
    embeddingOk = false;
    const client = fakeClient();
    await summarizeAndStoreAgentMemory(storeOpts(client));
    assertStrictEquals(client.calls.inserts[0].summary_embedding, null);
    assertStrictEquals(client.calls.inserts[0].category, "conversation");
    assertStrictEquals(client.calls.inserts[0].importance, 50);
  },
);

Deno.test(
  "summarizeAndStoreAgentMemory skips non-object or incomplete LLM output",
  async () => {
    embeddingOk = true;
    for (const content of [
      "null",
      '"text"',
      "42",
      '["T","S"]',
      '{"title":"T"}',
    ]) {
      chatContent = content;
      const client = fakeClient();
      await summarizeAndStoreAgentMemory(storeOpts(client));
      assertStrictEquals(client.calls.inserts.length, 0, content);
    }
  },
);

Deno.test(
  "recallAgentMemory sends the query embedding as JSON text",
  async () => {
    embeddingOk = true;
    const client = fakeClient();
    const rows = await recallAgentMemory(client, "agent", "query", 4);
    assertEquals(rows, [{ title: "t" }]);
    const { name, args } = client.calls.rpcs[0];
    assertStrictEquals(name, "match_agent_memory");
    assertStrictEquals(typeof args.p_query_embedding, "string");
    assertEquals(JSON.parse(args.p_query_embedding), EMBEDDING);
    assertStrictEquals(args.p_limit, 4);
  },
);

Deno.test("saveAgentMemory stores the embedding as JSON text", async () => {
  embeddingOk = true;
  const client = fakeClient();
  await saveAgentMemory({
    supabase: client,
    tenant_id: "tenant",
    agent_id: "agent",
    category: "fact",
    title: "T",
    summary: "S",
  });
  const row = client.calls.inserts[0];
  assertStrictEquals(typeof row.summary_embedding, "string");
  assertEquals(JSON.parse(row.summary_embedding), EMBEDDING);
});
