import type { RunState } from "./state.ts";
import { appendAgencyDataRules } from "../agency-data/rules-block.ts";
import { appendCarmenPulseRules } from "../pulse-refresh/rules-block.ts";
/** append Run Standing Rules in the original run order. */
export async function appendRunStandingRules(
  run: RunState,
): Promise<Response | string | void> {
  // Leads belong to the agency; a client's leads come from its reports (AIO-510). After
  // every skin, before the pulse block, which stays the prompt's last rule.
  run.systemPrompt = appendAgencyDataRules(run.systemPrompt, {
    isCarmen: run.isCarmen,
    pinSkillsOnly: run.pinSkillsOnly,
  });
  // Versioned pulse rules (AIO-237) come after the V1/V2 prompt and every
  // skin's text, so a tenant pulse skin that says not to refresh cannot
  // override them. On WhatsApp and scheduled tasks the block also keeps the
  // pulse to the short digest.
  run.systemPrompt = appendCarmenPulseRules(run.systemPrompt, {
    isCarmen: run.isCarmen,
    surface: run.input.surface,
    pinSkillsOnly: run.pinSkillsOnly,
  });
  // Surface instruction-capture confirmation in the system prompt so the model knows
  // a rule was just persisted and can acknowledge it briefly without re-saving.
  if (run.instructionCaptured) {
    run.systemPrompt += `\n\n🧾 הנחיה חדשה נשמרה לזיכרון אוטומטית: "${run.instructionCaptured}". אשרי בקצרה ("נרשם") והמשיכי בבקשה.`;
  }
}
