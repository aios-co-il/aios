export const skillsTools = [
  {
    name: "get_carmen_skins",
    description:
      "הסקינים (הפרסונות) של כרמן ותמונות הדיוקן שלהן: slug, שם בעברית, הסקינים שבכל פרסונה, has_portrait ו-portrait_url. כשהעסק העלה תמונה משלו לסקין מוחזר קישור חתום לשעה (source=custom). portrait_url הוא קישור מלא: בצ׳אט שמציג Markdown כתמונה ![שם](portrait_url), בוואטסאפ כקישור. לשאלות על כרמן עצמה, על הסקינים שלה ועל התמונות שלהן. קריאה בלבד.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "recall_skills",
    description:
      "חיפוש סקילים (פרוצדורות שמורות) רלוונטיים למשימה הנוכחית. השתמש כשהמשימה מורכבת/חוזרת ויתכן שכבר יש לך פרוצדורה שמורה לבצע אותה. הסקילים הרלוונטיים ביותר כבר מוזרקים אוטומטית, אבל ניתן לחפש עוד.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "תיאור המשימה לחיפוש" },
        limit: { type: "integer", description: "ברירת מחדל 5" },
      },
      required: ["query"],
    },
  },
  {
    name: "create_skill",
    description:
      "יצירת סקיל חדש (פרוצדורה שמורה) אחרי שביצעת משימה מורכבת בהצלחה ויש סיכוי שתבצע אותה שוב. כתוב את ה-body כשלבים ברורים בעברית, מצב מילות טריגר רלוונטיות שיעזרו למצוא את הסקיל בעתיד. אל תיצור סקיל למשימות פשוטות/חד-פעמיות.",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: 'שם קצר וברור (למשל "ניתוח קמפיין שבועי")',
        },
        description: {
          type: "string",
          description: "משפט אחד שמתאר מתי להשתמש בסקיל הזה",
        },
        body: {
          type: "string",
          description:
            "תוכן הסקיל - שלבים מסודרים, באיזה כלים להשתמש, מה לבדוק",
        },
        trigger_phrases: {
          type: "array",
          items: { type: "string" },
          description: "מילים/ביטויים בעברית או באנגלית שיעזרו למצוא את הסקיל",
        },
      },
      required: ["name", "description", "body"],
    },
  },
  {
    name: "update_skill",
    description:
      "עדכון/שיפור סקיל קיים על בסיס ניסיון חדש. השתמש כשגילית שצעד מסוים לא עובד טוב או שיש דרך טובה יותר לבצע את המשימה.",
    parameters: {
      type: "object",
      properties: {
        skill_id: { type: "string" },
        body: { type: "string", description: "תוכן מעודכן" },
        description: {
          type: "string",
          description: "תיאור מעודכן (אופציונלי)",
        },
        change_note: { type: "string", description: "הערה קצרה מה השתנה ולמה" },
      },
      required: ["skill_id", "body"],
    },
  },
];
