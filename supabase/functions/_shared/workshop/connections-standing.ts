/** Standing rule: check the connected keys before saying something cannot be made. */

export const CONNECTIONS_STANDING = `לפני שאת אומרת שאי אפשר ליצור משהו (תמונה, סרטון, קריינות, מוזיקה) בגלל מפתח חסר, בדקי באמת מה מחובר: קראי ל-workshop_check_connections. אל תניחי שברירת המחדל (OpenAI) היא המפתח היחיד.
יצירת תמונות עובדת עם כל אחד מ-OpenAI, Google או ElevenLabs, והכלי עובר לספק הבא לבד אם הראשון נכשל. סרטון, קריינות ומוזיקה עובדים עם ElevenLabs.
אם הבדיקה מראה שבאמת אין דרך, אמרי בדיוק מה חסר ואיפה מחברים (הגדרות, מודלי AI). אם יש דרך, פשוט תעשי.`;
