import type { RunState } from "./state.ts";
import { workshopDevTaskRule } from "../dev-task-send-rules.ts";
import { buildDevEscalationPromptRule } from "../../_shared/dev-escalation-auth.ts";
import { devTaskSendRule } from "../dev-task-send-rules.ts";
import { buildVoiceCapabilityPromptRule } from "../../_shared/wa-voice-resolve.ts";
import { agentMoodPrompt } from "../../_shared/carmen/agent-mood.ts";
/** append Run Policies in the original run order. */
export async function appendRunPolicies(
  run: RunState,
): Promise<Response | string | void> {
  const ctxMeta = run.input.bodyJson.context_metadata;
  if (
    run.isCarmen &&
    run.input.surface === "internal_chat" &&
    ctxMeta &&
    typeof ctxMeta === "object" &&
    ctxMeta.source === "command_center_sidebar"
  ) {
    run.systemPrompt +=
      "\n\n🛠️ === Command Center sidecar (system fix context) ===\n" +
      "David is chatting from the persistent sidecar while viewing a live AIOS screen.\n" +
      "Use the screen context in system_prompt_addon / context_metadata to understand what he sees.\n" +
      "Respond normally. For dev/system/code work use the Dev Task Command Center workflow:\n" +
      "1) find_dev_task_duplicates → 2) create_dev_task (structured brief) → 3) tell David what the task is and ask: [[בחירה: לשלוח את משימת הפיתוח? | כן | לא]] → 4) only after his yes in a later message: approve_dev_task + dispatch_dev_task (the server refuses them in the turn that opened the task, even when he already said 'שלחי לפיתוח').\n" +
      "Never open duplicate Cursor sessions — if dispatch timed out, use attach_dev_task_session with the bc- id.\n" +
      "Legacy direct mcp_Cursor__request_dev_task only if dev_tasks workflow is unavailable, and also only after his yes in a later message.\n" +
      "Always include path + entity context in any dev task you create.\n" +
      `context_metadata: ${JSON.stringify(ctxMeta).slice(0, 4000)}`;
  }
  // Hard rule for both V1 and V2: only allowlisted requesters may escalate
  // system/dev/config/code fixes to Cursor/Claude/Manus/GitHub agent.
  // The workshop has no connector or delegate tools: there a dev task goes only through
  // create_dev_task. Everywhere a send to a coding agent waits for the user's yes in a later
  // message, read only in an AIOS chat (dev-task-approval.ts).
  run.systemPrompt +=
    run.inWorkshopRequest && run.devEscalationTier
      ? workshopDevTaskRule(run.devEscalationTier)
      : buildDevEscalationPromptRule(run.devEscalationTier) +
        (run.devEscalationTier ? devTaskSendRule(run.appChatTurn) : "");
  if (
    run.isCarmen &&
    run.input.surface === "whatsapp" &&
    run.canEscalateDevFixes
  ) {
    run.systemPrompt +=
      "\n\n📱 === משימות פיתוח מ-WhatsApp (מורשה) ===\n" +
      'כשמבקשים "תעבירי לפיתוח" / "שלחי לקרסר" / תיקון מערכת:\n' +
      "1) find_dev_task_duplicates → 2) create_dev_task (brief מובנה) → 3) אמרי במשפט מה המשימה ולמי, ושהיא מחכה לאישור במרכז משימות הפיתוח באפליקציה (כפתור 'שלח'). מוואטסאפ לא מאשרים ולא שולחים: השרת מסרב ל-approve_dev_task, ל-dispatch_dev_task ולשליחה ישירה.\n" +
      "4) שאלה על משימה שכבר נשלחה: list_dev_tasks או attach_dev_task_session.";
  }
  // Voice capability (both prompt versions): answer from 🎤 / explicit failure markers.
  if (
    run.isCarmen &&
    (run.input.surface === "whatsapp" ||
      run.input.surface === "internal_chat" ||
      run.input.surface === "aios")
  ) {
    run.systemPrompt += buildVoiceCapabilityPromptRule();
  }
  if (run.isCarmen && run.input.surface === "grok_bot") {
    run.systemPrompt +=
      "\n\n=== Grok Bot (חיצוני) ===\n" +
      "הבקשה הגיעה מ-Grok Bot — עוזר דיוויד מחוץ לאפליקציה. עני ישירות; אל תשלחי בחזרה ל-Grok Bot (mcp_Grok__*) — " +
      "את כבר המטפלת. אם צריך פיתוח/קוד — Cursor או Claude, לא Grok.";
  }
  if (run.isCarmen && run.relevantLongTermMemory.length > 0) {
    run.systemPrompt += `\n\n🧠 === זיכרון ארוך רלוונטי שנשלף אוטומטית ===
זהו זיכרון העבודה שלך מהמערכת, לא "מערכת אחרת". השתמשי בו כשהוא רלוונטי לבקשה, אך העדיפי נתוני כלים חיים כשיש סתירה.
${run.relevantLongTermMemory.map((item) => `• [${item.label}] ${item.text}`).join("\n")}`;
  }
  // ─── Mood / persona modulation (swappable tone layer) ───
  {
    const moodPrompt = agentMoodPrompt(run.agent.mood, run.agent.id);
    if (moodPrompt) {
      run.systemPrompt += `\n\n${moodPrompt}`;
    }
  }
  // ─── Command Center (internal_chat) rendering layer ───
  // The dashboard chat renders full GitHub-flavored Markdown (ReactMarkdown +
  // remark-gfm), unlike WhatsApp. Placed after the V1/V2 prompt building so it
  // overrides the WhatsApp plain-text + brevity rules on this surface only.
  if (run.isCarmen && run.input.surface === "internal_chat") {
    run.systemPrompt += `\n\n🖥️ === תצוגת דשבורד (חובה — גובר על כללי WhatsApp) ===
את עונה עכשיו בצ'אט של ה-Command Center, שמציג Markdown מלא (כולל טבלאות GFM) — לא ב-WhatsApp.
• כלל "בלי markdown" וכלל "1–3 משפטים" לא חלים כאן. מותר ורצוי Markdown מלא.
• כל דוח או רשימה עם 3+ פריטים או כמה שדות לפריט (בדיקת דופק, סקירת לקוחות, קמפיינים, לידים, משימות) — חובה להציג כטבלת Markdown מסודרת עם שורת כותרות, ולא כטקסט רץ.
• מבנה תשובה לדוח: משפט פתיחה קצר → הטבלה → 1–3 שורות תובנות/חריגים בסוף (אפשר כרשימת נקודות).
• דוגמה לבדיקת דופק:\n| לקוח | סטטוס | קמפיינים | לידים | עלות/ליד | הערה |\n|---|---|---|---|---|---|\n• מספרים בתאים כמספרים (בלי מלל מיותר), הערות קצרות; סטטוס עם אימוג'י (🟢/🟡/🔴) כשרלוונטי.
• תשובות קצרות לשאלות פשוטות נשארות קצרות — טבלה רק כשיש באמת נתונים טבלאיים.`;
  }
}
