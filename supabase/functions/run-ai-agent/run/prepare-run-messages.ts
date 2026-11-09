import type { RunState } from "./state.ts";
/** prepare Run Messages in the original run order. */
export async function prepareRunMessages(
  run: RunState,
): Promise<Response | string | void> {
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
  run.messages.push({ role: "user", content: run.command_text });
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
    const manusBody = {
      action: "create_task",
      tenantId: run.agent.tenant_id,
      prompt: run.command_text,
    };
    const manusRes = await fetch(
      `${run.dependencies.SUPABASE_URL}/functions/v1/manus-api`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${run.dependencies.SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify(manusBody),
      },
    );
    if (!manusRes.ok) {
      const errText = await manusRes.text();
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
    const manusData = await manusRes.json();
    const taskUrl = manusData.task_url || manusData.share_url || "";
    run.finalOutput = `✅ משימה נשלחה ל-Manus AI${taskUrl ? `\n🔗 ${taskUrl}` : ""}\nמזהה: ${manusData.task_id || "—"}`;
    if (run.input.emit) {
      run.input.emit({ type: "token", content: run.finalOutput });
    }
    return run.finalOutput;
  }
}
