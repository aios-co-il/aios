import type { RunState } from "./state.ts";
import { INSTRUCTION_TRIGGER_RE } from "../instruction-trigger.ts";
import { saveAgentMemory } from "../../_shared/agent-memory.ts";
/** capture Run Instruction in the original run order. */
export async function captureRunInstruction(
  run: RunState,
): Promise<Response | string | void> {
  run.instructionCaptured = null;
  try {
    const cmdRaw = String(run.command_text || "").trim();
    const m = cmdRaw.match(INSTRUCTION_TRIGGER_RE);
    const looksLikeInstruction =
      !!m && cmdRaw.length > 0 && cmdRaw.length < 1500;
    // A workshop message is a creative brief ("פיצריה שתמיד פתוחה"), not a standing instruction,
    // and an automation's text is not someone teaching Carmen (AIO-241).
    if (
      looksLikeInstruction &&
      run.resolvedTenantId &&
      !run.inWorkshopRequest &&
      !run.automationRun
    ) {
      // Extract the surrounding sentence/paragraph (split on . ! ? newlines, max ~400 chars)
      const triggerIdx = (m as RegExpMatchArray).index ?? 0;
      const before =
        cmdRaw
          .slice(0, triggerIdx)
          .split(/[.!?\n]/)
          .slice(-1)[0] || "";
      const after = cmdRaw.slice(triggerIdx).split(/[.!?\n]/)[0] || "";
      const sentence =
        (before + after).trim().slice(0, 400) || cmdRaw.slice(0, 400);
      // Build a stable snake_case key from a short hash of the content.
      let h = 0;
      for (let i = 0; i < sentence.length; i++) {
        h = ((h << 5) - h + sentence.charCodeAt(i)) | 0;
      }
      const keyBase = `instr_${Math.abs(h).toString(36)}`;
      await run.supabase.from("ai_memory").upsert(
        {
          tenant_id: run.resolvedTenantId,
          user_id:
            run.callerUserId ||
            (run.resolvedUserId !== "system" ? run.resolvedUserId : null) ||
            null,
          key: keyBase,
          content: sentence,
          category: "instructions",
        },
        {
          onConflict: "user_id,tenant_id,category,key",
          ignoreDuplicates: false,
        },
      );
      // Mirror to Hermes FTS layer (agent_memory) so cross-conversation recall sees it.
      try {
        await saveAgentMemory({
          supabase: run.supabase,
          tenant_id: run.resolvedTenantId,
          agent_id: run.agent_id as string,
          category: "instructions",
          title: keyBase,
          summary: sentence,
          importance: 95,
          metadata: {
            source: "auto_instruction_capture",
            surface: run.input.surface,
            key: keyBase,
            trigger: (m as RegExpMatchArray)[0],
          },
        });
      } catch {
        /* non-fatal */
      }
      run.instructionCaptured = sentence;
      console.log(
        `[AGENT] Auto-captured instruction (${run.input.surface}, trigger="${(m as RegExpMatchArray)[0]}") → key=${keyBase}`,
      );
    }
  } catch (e: unknown) {
    console.error(
      "[AGENT] auto-instruction capture failed:",
      (e as Error | null)?.message,
    );
  }
}
