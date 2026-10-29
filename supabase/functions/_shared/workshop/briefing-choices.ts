/**
 * The briefing questions as tap-to-answer choices. The server writes the message the user sees
 * (see briefing.ts), so the questions reach the user as buttons and never as instructions.
 */

export interface Choice {
  label: string;
  options: string[];
}

export const STYLE_CHOICES: Record<"video" | "static", Choice[]> = {
  video: [
    {
      label: "דמות",
      options: ["דמות אחת קבועה", "כמה דמויות", "בלי דמות, רק מוצר ומקום"],
    },
    {
      label: "מראה",
      options: [
        "קולנועי ריאליסטי",
        "אנימציית תלת־ממד",
        "איור מונפש",
        "מושן גרפיקס",
      ],
    },
    {
      label: "צבעים",
      options: [
        "חם ומזמין",
        "נקי ומינימליסטי",
        "בהיר וצבעוני",
        "לפי צבעי המותג",
      ],
    },
  ],
  static: [
    {
      label: "סגנון",
      options: ["צילום", "איור", "תלת־ממד", "גרפי נקי"],
    },
    {
      label: "צבעים",
      options: [
        "לפי צבעי המותג",
        "חם ומזמין",
        "נקי ומינימליסטי",
        "בהיר וצבעוני",
      ],
    },
    {
      label: "טקסט על התמונה",
      options: ["בלי טקסט", "כותרת קצרה", "כותרת וקריאה לפעולה"],
    },
  ],
};

/** How the film should feel, asked before it is written. */
export const FILM_CHOICES: Choice[] = [
  {
    label: "קצב",
    options: ["אנרגטי ומהיר", "רגוע ורגשי", "מצחיק וקליל"],
  },
  {
    label: "קול",
    options: ["קריינית", "קריין", "דמות שמדברת למצלמה", "בלי קריינות"],
  },
  {
    label: "מוזיקה",
    options: ["אלקטרונית קצבית", "אקוסטית חמה", "תזמורתית", "בלי מוזיקה"],
  },
  {
    label: "סיום",
    options: ["לוגו וקריאה לפעולה", "לוגו בלבד", "בלי סגיר"],
  },
];

export const choiceLine = (choice: Choice) =>
  `[[בחירה: ${choice.label} | ${choice.options.join(" | ")}]]`;
