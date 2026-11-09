import {
  REQUEST_DEPENDENCIES,
  type RequestDependencies,
} from "./dependencies.ts";

import type { AgentRequestBody } from "./types.ts";
import { corsHeaders } from "../runtime.ts";

import { bindRunAgentCaller } from "../caller-trust.ts";

import { SUPABASE_URL } from "../runtime.ts";
import { SUPABASE_SERVICE_ROLE_KEY } from "../runtime.ts";

import type { Surface } from "../surface.ts";

import { brainDenied } from "../../_shared/carmen/brain-guard.ts";
import { refusedBrainResponse } from "./refused-brain.ts";

/** Production entry uses the unchanged authentication and runtime implementations. */
export function handleRequest(req: Request): Promise<Response> {
  return handleRequestWithDependencies(req, REQUEST_DEPENDENCIES);
}

/** Handles authentication, caller binding, tenant gating and response transport in order. */
export async function handleRequestWithDependencies(
  req: Request,
  dependencies: RequestDependencies,
): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const auth = await dependencies.requireAuth(req);
  if (!auth) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let bodyJson = {} as AgentRequestBody;
  try {
    bodyJson = (await req.json()) as AgentRequestBody;
  } catch {
    /* ignore */
  }
  // Never trust a browser-supplied identity. A user JWT runs as that user, without
  // the caller phone (lead_data), WhatsApp target (wa_notify), whatsapp surface or
  // admin config — approvals are bound to the identity those fields would set.
  // Service-to-service calls keep their explicit user (./caller-trust.ts).
  bindRunAgentCaller(bodyJson, auth);

  if (bodyJson.direct_tool) {
    if (auth.kind !== "service") {
      return new Response(
        JSON.stringify({ error: "direct_tool is service-only" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    return await dependencies.handleDirectTool(bodyJson);
  }

  // A signed-in user runs only in a tenant they belong to (AIO-306), checked
  // before any brain, key or tool of that tenant is read.
  const guardClient = dependencies.createClient(
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
  );
  const tenantDenied = await dependencies.runTenantDenied(
    guardClient,
    auth,
    bodyJson,
  );
  if (tenantDenied) {
    return new Response(JSON.stringify({ error: tenantDenied }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const wantStream = bodyJson.stream === true;
  const surface: Surface =
    bodyJson.surface === "aios"
      ? "aios"
      : bodyJson.surface === "task"
        ? "task"
        : bodyJson.surface === "whatsapp"
          ? "whatsapp"
          : bodyJson.surface === "grok_bot"
            ? "grok_bot"
            : "internal_chat";

  // The brain the user picked runs Carmen's loop (_shared/carmen/brain-engine);
  // the route, grant and keys are all read here, never taken from the body.
  const engine = await dependencies.resolveWorkshopAwareEngine(
    guardClient,
    auth,
    bodyJson,
    async () =>
      !(await dependencies.internalBrainDenied(guardClient, auth, {
        tenantId: bodyJson.tenant_id,
        agentId: bodyJson.agent_id,
      })),
  );
  if (engine.kind === "denied") {
    return brainDenied("brain");
  }
  if (engine.kind === "refused") {
    return refusedBrainResponse(engine.message, wantStream);
  }
  // Per-user Carmen permissions, on every surface (_shared/carmen/brain-guard).
  // A picked model brain was checked against its own grant above.
  if (engine.kind === "internal") {
    const denied = await dependencies.internalBrainDenied(guardClient, auth, {
      tenantId: bodyJson.tenant_id,
      agentId: bodyJson.agent_id,
    });
    if (denied) {
      return denied;
    }
  }
  const brainEngine = engine.kind === "connections" ? engine : undefined;
  // Read only when Carmen's own engine runs: the OpenRouter brain as its last link, under
  // that brain's own access rules.
  /** Retains the original internalTail helper. */
  function internalTail() {
    return dependencies.openRouterTail(guardClient, auth, bodyJson);
  }

  if (!wantStream) {
    return await dependencies.handleRunAgent(
      bodyJson,
      surface,
      undefined,
      brainEngine,
      { authKind: auth.kind, origin: req.headers.get("origin") },
      internalTail,
    );
  }

  // Streaming mode: AIOS-compatible SSE.
  // Events emitted: {type:'tool_call',tool,args}, {type:'token',content}, {type:'done',...}
  // The turn keeps running after the client disconnects (closed chat panel,
  // reloaded tab), and the server saves the answer (_shared/carmen/background-reply).
  return dependencies.createAgentStream({
    req,
    bodyJson,
    surface,
    authKind: auth.kind,
    brainEngine,
    internalTail,
  });
}
