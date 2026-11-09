import type { DelegateParallelArgs } from "./delegation-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";
import { parallelTaskArgs } from "../tool-contracts-admin.ts";
import { spawnSubagentBatch } from "../../_shared/subagent.ts";

/** Preserves the existing delegate_parallel executor and side-effect order. */
export async function executeDelegateParallel(
  args: DelegateParallelArgs,
  context: ToolExecutionContext,
) {
  const { supabase, tenantId, userId, agentId, waNotify } = context;

  const items: Array<unknown> = Array.isArray(args.tasks) ? args.tasks : [];
  if (items.length === 0) {
    throw new Error("tasks (array of {title, prompt}) is required");
  }
  if (items.length > 8) {
    throw new Error("עד 8 תת-משימות מקבילות בבת אחת");
  }
  const cleaned = parallelTaskArgs(items).map((it) => ({
    title: it.title,
    prompt: it.prompt,
    taskSkills: Array.isArray(it.task_skills) ? it.task_skills : undefined,
    // Routing: read-only subtasks (side_effects:false) run in parallel;
    // mutating ones (default) run one-at-a-time in the serial lane.
    sideEffects:
      typeof it.side_effects === "boolean" ? it.side_effects : undefined,
  }));
  if (cleaned.length === 0) {
    throw new Error("כל תת-משימה חייבת title ו-prompt");
  }
  const batchId = crypto.randomUUID();
  return await spawnSubagentBatch(
    supabase,
    {
      parentAgentId: agentId || null,
      tenantId,
      taskMode: "background",
      createdBy: userId !== "system" ? userId : null,
      notify:
        waNotify && waNotify.surface === "whatsapp"
          ? (waNotify as Parameters<typeof spawnSubagentBatch>[1]["notify"])
          : null,
    },
    cleaned,
    batchId,
  );
}
