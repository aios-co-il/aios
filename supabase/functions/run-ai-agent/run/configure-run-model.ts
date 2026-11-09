import type { RunState } from "./state.ts";
import { resolveModel } from "../llm/model.ts";
import { workshopToolRounds } from "../../_shared/workshop/reply.ts";
import { DEV_ENVIRONMENT_STANDING } from "../../_shared/environments-standing.ts";
import { connectionsStanding } from "../../_shared/workshop/connections-standing.ts";
import { selfQuestionsStanding } from "../../_shared/carmen/self-questions.ts";
/** configure Run Model in the original run order. */
export async function configureRunModel(
  run: RunState,
): Promise<Response | string | void> {
  run.model = resolveModel(
    run.modelOverride || run.agent.engine || "gemini-3-flash",
  );
  run.maxRounds = run.workshopRoleForRun
    ? workshopToolRounds(run.agent.max_tool_rounds, run.workshopMode)
    : run.agent.max_tool_rounds || 25;
  run.safeTemp =
    typeof run.temperature === "number"
      ? Math.min(2, Math.max(0, run.temperature))
      : undefined;
  if (run.isCarmen) {
    run.systemPrompt += `\n\n=== סביבת פיתוח (חובה) ===\n${DEV_ENVIRONMENT_STANDING}`;
    // Only the workshop has workshop_check_connections; other chats get no such rule.
    const connections = connectionsStanding(run.inWorkshop);
    if (connections) {
      run.systemPrompt += `\n\n=== מפתחות וחיבורים (חובה) ===\n${connections}`;
    }
    run.systemPrompt += `\n\n=== שאלות עלייך ועל המערכת (חובה) ===\n${selfQuestionsStanding(
      {
        tier: run.devEscalationTier,
        // WhatsApp shows assistant text as plain text; the AIOS chats (the video studio's
        // included) show a Markdown picture as an image.
        markdownImages: run.input.surface !== "whatsapp",
        appChat: run.appChatTurn,
      },
    )}`;
  }
  if (run.tokenOptimize) {
    run.systemPrompt += `\n\n=== אופטימיזציית טוקנים (שלב 2 — פעילה) ===
נטענו הנחיות קבועות + זיכרון רלוונטי + כלים דרך אינדקס hybrid (מילות מפתח + embedding).
רוב הכלים מוצגים כסיכום קומפקטי; ל-top רלוונטיים יש סכמה מלאה. קריאה לכלי מקדמת אותו לסכמה מלאה בסבב הבא.
אם חסר כלי — search_agent_tools. לזיכרון: recall_memory / kb_search / recall_memory_fts.`;
  }
  run.skillTenantId = run.agent.tenant_id || run.tenant_id || null;
  run.disabledSkins = (run.agent.disabled_skins || []) as Array<string>;
}
