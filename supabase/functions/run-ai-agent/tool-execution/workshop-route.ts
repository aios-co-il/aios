import { executeWorkshopImage } from "./workshop-image.ts";
import type { BackgroundRuntime } from "../background-runtime.ts";
declare const EdgeRuntime: BackgroundRuntime;
import type { ToolExecutionContext } from "../tool-context.ts";
import type { ToolExecutor } from "./route.ts";
import { executeWorkshopTool } from "../../_shared/workshop-tools.ts";
import { assertCallerCanAccessClient } from "../../_shared/auth-helpers.ts";
import { imageProvidersFor } from "../../_shared/workshop/capabilities.ts";
import { connectedProviders } from "../../_shared/workshop/capabilities.ts";

import { fetchPublic } from "../../_shared/public-fetch.ts";
import { workshopVoiceSample } from "../../_shared/workshop/voice-sample.ts";
import { importWebImage } from "../../_shared/workshop/tools/add-assets.ts";
import { sceneEngineFor } from "../../_shared/workshop/scene-engine-for.ts";
import { videoConnectionsFor } from "../../_shared/workshop/video-connections.ts";
import { connectedSceneEngines } from "../../_shared/workshop/engine-choice.ts";

/** Applies the existing workshop dependencies and recursive image fallback. */
export function executeWorkshopRoute(
  args: Record<string, unknown>,
  context: ToolExecutionContext,
  executeTool: ToolExecutor,
): unknown {
  const { supabase, tenantId, approval, actorUserId, callerScope, name } =
    context;

  return executeWorkshopTool(
    supabase,
    tenantId,
    name,
    args,
    (clientId) => assertCallerCanAccessClient(supabase, clientId, callerScope),
    actorUserId,
    {
      turnId: approval.turnId ?? null,
      userText: approval.userText ?? null,
      lastAssistant: approval.lastAssistant ?? null,
      markedArtifactId: approval.markedArtifactId ?? null,
      approvedOutOfBand: approval.outOfBand === true,
      viewClientId: approval.viewClientId ?? null,
      openItemId: approval.openItemId ?? null,
      imageEngines: async () => {
        const { data } = await supabase
          .from("tenant_integrations")
          .select("settings")
          .eq("tenant_id", tenantId)
          .eq("integration_type", "llm")
          .eq("is_active", true)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        return imageProvidersFor(
          connectedProviders(
            (data?.settings || {}) as Record<string, unknown>,
            { openai: Deno.env.get("OPENAI_API_KEY") ?? undefined },
          ),
        );
      },
      generateImage: (...args) =>
        executeWorkshopImage(context, executeTool, ...args),
      envOpenAiKey: Deno.env.get("OPENAI_API_KEY") ?? undefined,
      background: (work) => {
        try {
          EdgeRuntime.waitUntil(work);
        } catch {
          void work;
        }
      },
      fetchPublic: (url, options) => fetchPublic(url, options),
      voiceSample: (voiceId) =>
        workshopVoiceSample(supabase, tenantId, voiceId),
      importImage: (url, scope) =>
        importWebImage(supabase, fetchPublic, url, scope),
      defaultEngine: async () => {
        const { data } = await supabase
          .from("tenant_integrations")
          .select("settings")
          .eq("tenant_id", tenantId)
          .eq("integration_type", "llm")
          .eq("is_active", true)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        return sceneEngineFor(
          (data?.settings || {}) as Record<string, unknown>,
          fetch,
          await videoConnectionsFor(supabase, tenantId),
        );
      },
      sceneEngines: async () => {
        const { data } = await supabase
          .from("tenant_integrations")
          .select("settings")
          .eq("tenant_id", tenantId)
          .eq("integration_type", "llm")
          .eq("is_active", true)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        return connectedSceneEngines(
          (data?.settings || {}) as Record<string, unknown>,
          await videoConnectionsFor(supabase, tenantId),
          Deno.env.get("RENDER_WORKER_KLING") === "1",
        );
      },
      videoConnections: () => videoConnectionsFor(supabase, tenantId),
    },
  );
}
