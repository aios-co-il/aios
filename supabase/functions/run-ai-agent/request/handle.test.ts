import { assertEquals } from "jsr:@std/assert@1";
import { handleRequestWithDependencies } from "./handle.ts";
import {
  REQUEST_DEPENDENCIES,
  type RequestDependencies,
} from "./dependencies.ts";
import { executorClient } from "../executors/test-client.ts";

const USER = "22222222-2222-4222-8222-222222222222";

/** Makes dependencies observable without opening a network connection. */
function dependencies(
  log: Array<string>,
  overrides: Partial<RequestDependencies> = {},
): RequestDependencies {
  const fixture = executorClient([]);
  return {
    ...REQUEST_DEPENDENCIES,
    requireAuth: async () => {
      log.push("auth");
      return { kind: "user", userId: USER };
    },
    createClient: () => {
      log.push("client");
      return fixture.context.supabase;
    },
    runTenantDenied: async () => {
      log.push("tenant");
      return null;
    },
    resolveWorkshopAwareEngine: async () => {
      log.push("brain");
      return { kind: "internal" };
    },
    internalBrainDenied: async () => {
      log.push("grant");
      return null;
    },
    openRouterTail: async () => {
      log.push("tail");
      return [];
    },
    handleDirectTool: async () => {
      log.push("direct");
      return new Response("direct");
    },
    handleRunAgent: async () => {
      log.push("run");
      return new Response("run");
    },
    createAgentStream: () => {
      log.push("stream");
      return new Response("stream");
    },
    ...overrides,
  };
}

/** A browser request carrying intentionally forged service-only identity fields. */
function request(extra: Record<string, unknown> = {}) {
  return new Request("https://example.supabase.co/functions/v1/run-ai-agent", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      origin: "https://app.example",
    },
    body: JSON.stringify({
      tenant_id: "tenant",
      user_id: "forged",
      command_text: "hello",
      surface: "whatsapp",
      lead_data: { phone: "forged" },
      wa_notify: { chat_id: "forged" },
      ...extra,
    }),
  });
}

Deno.test(
  "OPTIONS does not authenticate or read any request/tenant data",
  async () => {
    const log: Array<string> = [];
    const response = await handleRequestWithDependencies(
      new Request("https://example.test", { method: "OPTIONS" }),
      dependencies(log),
    );
    assertEquals(response.status, 200);
    assertEquals(response.headers.get("Access-Control-Allow-Origin"), "*");
    assertEquals(log, []);
  },
);

Deno.test(
  "unauthorized requests are rejected before parsing their body",
  async () => {
    const log: Array<string> = [];
    const req = request();
    const response = await handleRequestWithDependencies(
      req,
      dependencies(log, {
        requireAuth: async () => {
          log.push("auth");
          return null;
        },
      }),
    );
    assertEquals(response.status, 401);
    assertEquals(await response.json(), { error: "Unauthorized" });
    assertEquals(req.bodyUsed, false);
    assertEquals(log, ["auth"]);
  },
);

Deno.test(
  "browser direct-tool calls are refused before client or tenant reads",
  async () => {
    const log: Array<string> = [];
    const response = await handleRequestWithDependencies(
      request({ direct_tool: { action: "list" } }),
      dependencies(log),
    );
    assertEquals(response.status, 403);
    assertEquals(await response.json(), {
      error: "direct_tool is service-only",
    });
    assertEquals(log, ["auth"]);
  },
);

Deno.test(
  "tenant denial precedes brain/key reads and sees only the bound caller",
  async () => {
    const log: Array<string> = [];
    const response = await handleRequestWithDependencies(
      request(),
      dependencies(log, {
        runTenantDenied: async (_client, _auth, body) => {
          log.push("tenant");
          assertEquals(body.user_id, USER);
          assertEquals(body.surface, "internal_chat");
          assertEquals(body.lead_data, undefined);
          assertEquals(body.wa_notify, undefined);
          return "not_in_tenant";
        },
      }),
    );
    assertEquals(response.status, 403);
    assertEquals(await response.json(), { error: "not_in_tenant" });
    assertEquals(log, ["auth", "client", "tenant"]);
  },
);

Deno.test(
  "authorized JSON runs preserve origin and defer the internal fallback lookup",
  async () => {
    const log: Array<string> = [];
    const response = await handleRequestWithDependencies(
      request(),
      dependencies(log, {
        handleRunAgent: async (body, surface, emit, brain, context, tail) => {
          log.push("run");
          assertEquals(body.user_id, USER);
          assertEquals(surface, "internal_chat");
          assertEquals(emit, undefined);
          assertEquals(brain, undefined);
          assertEquals(context, {
            authKind: "user",
            origin: "https://app.example",
          });
          assertEquals(typeof tail, "function");
          return new Response("run");
        },
      }),
    );
    assertEquals(await response.text(), "run");
    assertEquals(log, ["auth", "client", "tenant", "brain", "grant", "run"]);
  },
);

Deno.test(
  "service direct-tool requests preserve their explicit caller and bypass brain routing",
  async () => {
    const log: Array<string> = [];
    const response = await handleRequestWithDependencies(
      request({ direct_tool: { action: "list" } }),
      dependencies(log, {
        requireAuth: async () => {
          log.push("auth");
          return { kind: "service", userId: null };
        },
        handleDirectTool: async (body) => {
          log.push("direct");
          assertEquals(body.user_id, "forged");
          return new Response("direct");
        },
      }),
    );
    assertEquals(await response.text(), "direct");
    assertEquals(log, ["auth", "direct"]);
  },
);
