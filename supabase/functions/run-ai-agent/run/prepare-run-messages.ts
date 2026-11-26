import { invokeExecutorFunction } from "../executors/invoke-executor-function.ts";
import { withBrowserTab } from "../../_shared/carmen/screen-context.ts";
import { textOnlyTurn } from "../attachments/picture-turn.ts";
import type { RunState } from "./state.ts";

/** Prepares provider messages, or delegates a directly configured Manus turn. */
export async function prepareRunMessages(
  run: RunState,
): Promise<Response | string | void> {
  run.filteredTools = run.deviceTurn.withoutWithheld(run.filteredTools);
  run.exposedMcpTools.splice(
    0,
    run.exposedMcpTools.length,
    ...run.deviceTurn.withoutWithheld(run.exposedMcpTools),
  );
  run.rebuildToolsForApi();
  run.expandAgentTools(run.deviceTurn.offeredTools);
  run.messages = [{ role: "system", content: run.systemPrompt }];
  // Add conversation history from Carmen WhatsApp sessions
  const history = run.serverConversationId
    ? run.serverConversationHistory
    : Array.isArray(run.conversation_history)
      ? run.conversation_history
      : [];

  for (const h of history) {
    if (h.role === "user" || h.role === "assistant") {
      run.messages.push({ role: h.role, content: h.content });
    }
  }

  // Add current message
  const userTurn = run.deviceTurn.userTurn(
    withBrowserTab(run.command_text, run.input.bodyJson.context_metadata),
  );
  run.messages.push({ role: "user", content: userTurn });
  run.pictureTurnAt = { at: run.messages.length - 1, text: userTurn };
  run.finalOutput = "";
  run.toolLog = [];
  run.startTime = Date.now();

  // If the agent's engine is Manus — delegate the entire conversation to Manus AI
  // and return the result directly (no tool loop needed here).
  if (
    !run.pinSkillsOnly &&
    !run.input.brainEngine &&
    (run.model === "manus/manus-1" || run.model === "manus-1")
  ) {
    return await executeManusTask(run, userTurn);
  }
}

/** Delegates to Manus and emits the existing terminal confirmation. */
async function executeManusTask(
  run: RunState,
  userTurn: string,
): Promise<string> {
  const manusBody = {
    action: "create_task",
    tenantId: run.agent.tenant_id,
    prompt: textOnlyTurn(userTurn, run.pictureRequest),
  };
  const manusRes = await invokeExecutorFunction(
    run.supabase,
    "manus-api",
    manusBody,
    "text",
  );

  if (!manusRes.ok) {
    const errText = manusRes.data;
    const detail = (() => {
      try {
        return JSON.parse(errText)?.error;
      } catch {
        return errText;
      }
    })();

    if (/not configured|key not found|api_key/i.test(String(detail))) {
      throw new Error("Manus API key חסר — הגדר אותו בהגדרות אינטגרציות");
    }

    throw new Error(`Manus API error [${manusRes.status}]: ${detail}`);
  }

  const manusData = manusRes.data;
  const taskUrl = manusData.task_url || manusData.share_url || "";
  run.finalOutput = `✅ משימה נשלחה ל-Manus AI${taskUrl ? `\n🔗 ${taskUrl}` : ""}\nמזהה: ${manusData.task_id || "—"}`;

  if (run.input.emit) {
    run.input.emit({ type: "token", content: run.finalOutput });
  }

  return run.finalOutput;
}
