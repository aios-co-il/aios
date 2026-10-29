/**
 * Standing rule in the workshop: check the connected keys before saying something cannot be
 * made. Only the workshop has workshop_check_connections, so other chats get no rule. Like the
 * skins and the briefing (migration 20261026102400, briefing.ts), the engine is never a question
 * for the user: the server picks the best connected one.
 */

const CONNECTIONS_STANDING = `לפני שאת אומרת שאי אפשר ליצור משהו (תמונה, סרטון, קריינות, מוזיקה) בגלל מפתח חסר, בדקי באמת מה מחובר: קראי ל-workshop_check_connections. אל תניחי שברירת המחדל (OpenAI) היא המפתח היחיד.
יצירת תמונות עובדת עם מוח OpenRouter מחובר או עם כל אחד מ-OpenAI, Google, ElevenLabs או Higgsfield. כשמחוברים כמה מנועים, אל תשאלי את המשתמש באיזה מנוע ליצור: השרת בוחר לבד את הטוב ביותר שמחובר (אם המשתמש כתב מנוע, העבירי אותו ב-engine), ואת רק אומרת במשפט אחד במה זה נוצר. סרטון וקריינות עובדים עם ElevenLabs או עם מוח OpenRouter. מוזיקה רק עם ElevenLabs; בלעדיו הסרט מורכב בלי מוזיקת רקע.
אם הבדיקה מראה שבאמת אין דרך, אמרי בדיוק מה חסר ואיפה מחברים (הגדרות, מודלי AI). אם יש דרך, פשוט תעשי.`;

/** The connections rule for this chat: the workshop gets it, other chats get none. */
export const connectionsStanding = (inWorkshop: boolean) =>
  inWorkshop ? CONNECTIONS_STANDING : "";
