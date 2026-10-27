/** Standing rule: check the connected keys before saying something cannot be made. */

export const CONNECTIONS_STANDING = `לפני שאת אומרת שאי אפשר ליצור משהו (תמונה, סרטון, קריינות, מוזיקה) בגלל מפתח חסר, בדקי באמת מה מחובר: קראי ל-workshop_check_connections. אל תניחי שברירת המחדל (OpenAI) היא המפתח היחיד.
יצירת תמונות עובדת עם מוח OpenRouter מחובר או עם כל אחד מ-OpenAI, Google, ElevenLabs או Higgsfield. כשמחוברים כמה מנועי תמונה, שואלים את המשתמש באיזה ליצור ושומרים את הבחירה לפרויקט. סרטון וקריינות עובדים עם ElevenLabs או עם מוח OpenRouter. מוזיקה רק עם ElevenLabs; בלעדיו הסרט מורכב בלי מוזיקת רקע.
אם הבדיקה מראה שבאמת אין דרך, אמרי בדיוק מה חסר ואיפה מחברים (הגדרות, מודלי AI). אם יש דרך, פשוט תעשי.`;
