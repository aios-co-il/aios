import type { RunState } from "./state.ts";
/** Preserves this part of the V1 prompt and its precedence. */
export function appendV1Presentation(run: RunState): void {
  // Inject writing style
  const writingStyle = run.agent.writing_style;
  if (writingStyle && writingStyle !== "professional") {
    const styleMap: Record<string, string> = {
      friendly: "כתוב בסגנון חברותי וחמול.",
      formal: "כתוב בסגנון פורמלי ועסקי.",
      casual: "כתוב בסגנון קזואלי ונגיש.",
      empathetic: "כתוב בסגנון אמפתי ומבין.",
    };
    if (styleMap[writingStyle]) {
      run.systemPrompt += `\n${styleMap[writingStyle]}`;
    }
  }
  // Inject response length
  const responseLength = run.agent.response_length;
  if (responseLength) {
    const lengthMap: Record<string, string> = {
      short: "הגבל תשובות ל-2-3 משפטים מקסימום.",
      detailed: "תן תשובות מפורטות ומקיפות.",
    };
    if (lengthMap[responseLength]) {
      run.systemPrompt += `\n${lengthMap[responseLength]}`;
    }
  }
  // Always inject current date and tenant context
  const now = new Date();
  const currentDate = now.toLocaleDateString("he-IL", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "Asia/Jerusalem",
  });
  const currentTime = now.toLocaleTimeString("he-IL", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jerusalem",
  });
  const tomorrowDate = new Date(now.getTime() + 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];
  const todayISO = now.toISOString().split("T")[0];
  run.systemPrompt += `\n\n=== תאריך ושעה נוכחיים ===\nהיום: ${currentDate}, שעה: ${currentTime}\nתאריך ISO של היום: ${todayISO}\nתאריך ISO של מחר: ${tomorrowDate}\nחשוב: כשמבקשים "למחר" השתמש ב-${tomorrowDate}, כש"היום" השתמש ב-${todayISO}.\n\n=== כללי אזור זמן ותזכורות (חובה) ===\n• אזור הזמן של המשתמש הוא Asia/Jerusalem (IST = UTC+2 / IDT = UTC+3). כל שעה שהמשתמש אומר היא בשעון ישראל.\n• כש-create_agent_task דורש scheduled_at — חובה להמיר משעון ישראל ל-UTC ב-ISO עם Z. דוגמה: "מוצ"ש 21:30" → 2026-06-20T18:30:00Z (קיץ, UTC+3). אסור לשמור שעת ישראל בתור UTC.\n• בתשובה למשתמש תמיד הציגי את הזמן בשעון ישראל (לדוגמה "מחר בשעה 21:30") — לא ב-UTC.\n• אם המשתמש שואל "מה תזמנת?" / "באיזו שעה התזכורת?" / "תבדקי אם הגדרת" / "את בטוחה?" — חובה לקרוא ל-list_my_agent_tasks לפני שאת עונה. אסור לנחש או לענות מהזיכרון.\n• הכלי create_agent_task מחזיר scheduled_at_israel — השתמשי בערך הזה כשאת מאשרת למשתמש את הזמן.\n• תזכורות אישיות / "תזכירי לי" / משימה מתוזמנת לכרמן → create_agent_task בלבד. אסור find_dev_task_duplicates / create_dev_task אלא אם המשתמש ביקש במפורש להעביר לפיתוח ("תעבירי ל-Cursor", "משימת פיתוח").\n\n=== זיכרון פעולות חוזרות (חובה) ===\n• לפני סקירת קמפיינים / סקירת לידים / כל פעולה כבדה חוזרת — חובה לקרוא קודם ל-recall_recent_action(action_type, max_age_hours=8). בדיקת דופק לא צריכה את זה: היא נשמרת ממילא, ורענון שלה הוא refresh_campaign_pulse.\n• אם נמצאה ריצה מהיום (found=true) ולא נאמר במפורש "רענני" / "עכשיו" / "בזמן אמת" / "תרוצי שוב" — אסור להריץ מחדש. ענו על בסיס הסיכום הקיים, ציינו את הזמן בשעון ישראל ("בדקתי בשעה HH:mm"), והוסיפו "אם רוצים לרענן עכשיו, אפשר לבקש".\n• רק אם המשתמש ביקש במפורש לרענן או שלא נמצא episode — להריץ את הפעולה.\n• בסיום של פעולה כבדה שבאמת רצה — חובה לקרוא ל-record_action_episode(action_type, summary) עם סיכום תמציתי. בלי זה הפעם הבאה לא תזכרי.\n• action_type סטנדרטי: 'pulse_check', 'campaign_analysis', 'lead_review', 'health_check'.`;
  run.systemPrompt += `\n\n=== הקשר ארגוני ===\n${run.tenantContext}`;
  // Inject memory context — instructions get top priority and a strict directive
  const memoryItems = run.memoryRes.data || [];
  if (memoryItems.length > 0) {
    const instructionItems = memoryItems.filter(
      (m) => m.category === "instructions",
    );
    const otherItems = memoryItems.filter((m) => m.category !== "instructions");
    if (instructionItems.length > 0) {
      const block = instructionItems
        .map((m) => `• ${m.key}: ${m.content}`)
        .join("\n");
      run.systemPrompt += `\n\n📌 === הנחיות קבועות שנשמרו (חובה לפעול לפיהן) ===\n${block}\n⚠️ אלה הנחיות שהמשתמש ביקש שתזכרי. חובה לכבד אותן בכל תשובה. אם תשובה חדשה סותרת אותן — ההנחיות גוברות, אלא אם המשתמש ביקש לעדכן/למחוק (אז קראי ל-save_memory עם אותו key, או delete_memory).`;
    }
    if (otherItems.length > 0) {
      const memoryContext = otherItems
        .map((m) => `[${m.category}] ${m.key}: ${m.content}`)
        .join("\n");
      run.systemPrompt += `\n\n🧠 === זיכרון מתמשך ===\n${memoryContext}`;
    }
  }
}
