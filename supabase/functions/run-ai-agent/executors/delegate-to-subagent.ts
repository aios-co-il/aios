import type { DelegateToSubagentArgs } from "./delegation-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";
import { spawnSubagent } from "../../_shared/subagent.ts";

/** Preserves the existing delegate_to_subagent executor and side-effect order. */
export async function executeDelegateToSubagent(
  args: DelegateToSubagentArgs,
  context: ToolExecutionContext,
) {
  const { supabase, tenantId, userId, agentId, waNotify } = context;

  if (!args.title || !args.prompt) {
    throw new Error("title and prompt are required");
  }
  return await spawnSubagent(supabase, {
    parentAgentId: agentId || null,
    tenantId,
    title: args.title,
    prompt: args.prompt,
    taskMode: args.task_mode || "background",
    taskSkills: Array.isArray(args.task_skills) ? args.task_skills : undefined,
    priority: typeof args.priority === "number" ? args.priority : undefined,
    createdBy: userId !== "system" ? userId : null,
    // When the caller is on WhatsApp, propagate the chat target so the
    // subagent can deliver its final result back to the same WA chat
    // instead of dying silently.
    notify:
      waNotify && waNotify.surface === "whatsapp"
        ? (waNotify as Parameters<typeof spawnSubagent>[1]["notify"])
        : null,
  });
}
