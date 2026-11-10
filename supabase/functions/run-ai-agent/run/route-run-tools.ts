import type { RunState } from "./state.ts";
import { selectRelevantToolsForMessage } from "../../_shared/carmen-token-optimizer.ts";
import { PRIORITY_TOOLS } from "../llm/tool-cap.ts";
import { applyToolForceIncludes } from "../../_shared/carmen-token-optimizer.ts";
import { isExplicitApprovalPhrase } from "../../_shared/wa-approval-flow.ts";
import { isExplicitRejectionPhrase } from "../../_shared/wa-approval-flow.ts";
import { extractMeetingUrl } from "../../_shared/meeting-url.ts";
import { promoteFindingDraftTool } from "../finding-draft/tool.ts";
import { promoteCardDraftTool } from "../card-draft-approval/tool.ts";
/** route Run Tools in the original run order. */
export async function routeRunTools(
  run: RunState,
): Promise<Response | string | void> {
  run.userAskedBackground =
    /\b(ברקע|תמשיכ[יה]\s+לבד|background|אל\s+תחכ[יה]|תעדכנ[יה]\s+אחר[\s-]?כך|תרוצ[יה]\s+ברקע)\b/i.test(
      run.cmd,
    );
  run.userAskedManus = /\b(manus|מנוס|מאנוס|מנואס)\b/i.test(run.cmd);
  run.userAskedGithubAgent =
    /\b(github|גיטהאב|גיט\s*האב|שגיאת\s*קוד|תמיכה\s*טכנית|אגנט\s*קוד)\b/i.test(
      run.cmd,
    );
  if (run.input.surface === "task") {
    run.filteredTools = run.filteredTools.filter(
      (t) =>
        t.name !== "delegate_to_subagent" &&
        t.name !== "delegate_parallel" &&
        t.name !== "delegate_to_manus" &&
        t.name !== "delegate_to_github_agent",
    );
  } else if (
    run.input.surface === "aios" ||
    run.input.surface === "whatsapp" ||
    run.input.surface === "internal_chat"
  ) {
    // Same default-direct rule for WhatsApp as for AIOS: hide delegation tools unless
    // the user explicitly asked for background work. On WhatsApp this is even more
    // important — there is no "window" the user can leave open to watch progress, and
    // until subagent results are pushed back to WA, claiming "I'm working in the
    // background" leaves the user with nothing.
    if (!run.userAskedBackground) {
      run.filteredTools = run.filteredTools.filter(
        (t) => t.name !== "delegate_to_subagent",
      );
    }
    if (!run.userAskedManus) {
      run.filteredTools = run.filteredTools.filter(
        (t) => t.name !== "delegate_to_manus",
      );
    }
    if (!run.userAskedGithubAgent) {
      run.filteredTools = run.filteredTools.filter(
        (t) => t.name !== "delegate_to_github_agent",
      );
    }
  }
  run.promotedToolNames = new Set(run.filteredTools.map((t) => t.name));
  if (run.pinSkillsOnly) {
    run.filteredTools = [];
    run.promotedToolNames = new Set();
    console.log(
      "[AGENT] pin_skills_only: exposing no tools (isolated copy session)",
    );
  } else if (run.isCarmen) {
    const routed = await selectRelevantToolsForMessage(
      run.supabase,
      String(run.command_text || ""),
      run.filteredTools,
      {
        lazy: run.tokenOptimize,
        priorityTools: PRIORITY_TOOLS,
        legacyCoreTools: run.dependencies.CORE_TOOLS,
        forceInclude: (userText, picked, fullSchemaNames) => {
          applyToolForceIncludes(
            userText,
            picked,
            {
              // In the workshop a yes/no answers the workshop, not the approval queue.
              isExplicitApprovalPhrase: run.inWorkshop
                ? () => false
                : isExplicitApprovalPhrase,
              isExplicitRejectionPhrase: run.inWorkshop
                ? () => false
                : isExplicitRejectionPhrase,
              extractMeetingUrl,
            },
            fullSchemaNames,
          );
          promoteFindingDraftTool(userText, picked, fullSchemaNames);
          promoteCardDraftTool(userText, picked, fullSchemaNames);
        },
      },
    );
    run.filteredTools = routed.tools;
    run.promotedToolNames = routed.fullSchemaNames;
  }
}
