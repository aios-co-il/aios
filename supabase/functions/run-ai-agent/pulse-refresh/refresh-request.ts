import { normalizeCommand } from "../../_shared/pulse/command-text.ts";

/**
 * "רענני דופק", "דופק עדכני", the voice "בדיקת דופק מלאה ועדכנית": the caller
 * wants the pulse recomputed now (refresh_campaign_pulse), not the stored one.
 * The refresh word must act on the pulse itself, so "מה הדופק? ותזכירי לי
 * לרענן את הטופס" or "תשלחי מחדש את הדופק" stay ordinary requests.
 */
export function isPulseRefreshRequest(
  text: string | null | undefined,
): boolean {
  const value = text || "";
  return REFRESH_PATTERNS.some((pattern) => pattern.test(value));
}

/**
 * Only a refresh request with nothing else in it may skip the model and answer
 * with the digest. A send, reminder, schedule or second clause keeps normal
 * routing, and so do the group, identity and isolation notes that WhatsApp
 * appends to every message.
 */
export function isBarePulseRefreshRequest(
  text: string | null | undefined,
): boolean {
  return BARE_PULSE_REFRESH_RE.test(normalizeCommand(text));
}

// Hebrew-aware word edges: JavaScript \b does not see Hebrew letters.
const WORD_START = String.raw`(?<![\p{L}\p{N}_])`;
const WORD_END = String.raw`(?![\p{L}\p{N}_])`;
// "דופק", "הדופק", "בדיקת דופק", "בדיקת הדופק", "דופק הקמפיינים".
const HEBREW_PULSE_NOUN = String.raw`(?:ה?בדיקת\s+)?ה?דופק(?:\s+ה?קמפיינים)?`;
// The Hebrew nouns, plus "pulse" and "pulse check".
const PULSE_NOUN = String.raw`(?:${HEBREW_PULSE_NOUN}|pulse(?:\s*check)?)`;
// "רענני", "תרענני", "לרענן", "רענון", "ריענון", "refresh": only when they act
// on the pulse noun that follows.
const REFRESH_VERB = String.raw`(?:ת?רענ(?:ני|ן|נו)|לרענן|ר(?:י)?ענון|refresh)`;
// "עדכני", "העדכני", "עדכנית", "מעודכן", "המעודכנת", "מלאה ועדכנית". Adjectives
// right after the pulse noun only, so the verb "ותעדכני אותי" never counts.
const FRESH_ADJECTIVE = String.raw`(?:מלא[הת]?\s+ו?)?ה?(?:עדכני|מעודכ[ןנ])ת?`;
// "מחדש" counts only after a run or check verb: "תריצי את הדופק מחדש", not
// "תשלחי מחדש את הדופק" or a resumed task's "אל תתחיל מחדש".
const RERUN_VERB = String.raw`(?:תריצי|הריצי|תריץ|הרץ|תבדקי|בדקי|תבדוק|בדוק|תחשבי|חשבי|תחשב|חשב|תעשי|עשי|תעשה|עשה)`;
// "תרענני לי את הדופק", "רענני לנו בבקשה דופק": a dative or "please" between
// the verb and the pulse noun.
const VERB_FILLER = String.raw`(?:(?:לי|לנו|בבקשה)\s+){0,2}`;
// "אל תרענני את הדופק", "לא צריך לרענן את הדופק", "don't refresh the pulse":
// a negated verb is not a refresh request.
const NOT_NEGATED = String.raw`(?<!${WORD_START}ו?(?:אל|לא|בלי|לא\s+צריך|אין\s+צורך|don['’]?t|do\s+not)\s+)`;

const REFRESH_PATTERNS = [
  // "רענני (לי) (את) (בדיקת) (ה)דופק", "רענון של הדופק", "refresh the pulse".
  new RegExp(
    `${WORD_START}${NOT_NEGATED}ו?${REFRESH_VERB}\\s+${VERB_FILLER}(?:(?:את|של|the)\\s+)?${PULSE_NOUN}${WORD_END}`,
    "iu",
  ),
  // "(בדיקת) (ה)דופק (ה)עדכני / מעודכן / מלאה ועדכנית".
  new RegExp(
    `${WORD_START}${PULSE_NOUN}\\s+${FRESH_ADJECTIVE}${WORD_END}`,
    "iu",
  ),
  // "fresh pulse", "up-to-date pulse check", "updated pulse".
  /\b(?:fresh|up[\s-]*to[\s-]*date|updated)\s+pulse(?:\s*check)?\b/iu,
  // "תריצי (לי) (את) הדופק מחדש", "תבדקי מחדש את הדופק".
  new RegExp(
    `${WORD_START}${NOT_NEGATED}ו?${RERUN_VERB}\\s+${VERB_FILLER}(?:(?:את\\s+)?${PULSE_NOUN}\\s+מחדש|מחדש\\s+(?:את\\s+)?${PULSE_NOUN})${WORD_END}`,
    "iu",
  ),
];

const BARE_PULSE_REFRESH_RE = new RegExp(
  String.raw`^(?:(?:כרמן|קרמן|carmen)[,\s]+)?` +
    String.raw`(?:(?:תני לי|תן לי|הציגי|הצג|אפשר|מה|תראי לי|תראה לי|בבקשה)\s+)?` +
    String.raw`(?:(?:ת?רענ(?:ני|ן)|רענון|ריענון)\s+${VERB_FILLER}(?:(?:את|של)\s+)?${HEBREW_PULSE_NOUN}` +
    String.raw`|${HEBREW_PULSE_NOUN}\s+${FRESH_ADJECTIVE}` +
    String.raw`|(?:תריצי|הריצי)\s+${VERB_FILLER}(?:את\s+)?${HEBREW_PULSE_NOUN}\s+מחדש` +
    String.raw`|refresh\s+(?:the\s+)?pulse(?:\s*check)?)` +
    String.raw`(?:\s+לפי\s+ה?סוכנויות)?(?:\s+(?:עכשיו|בבקשה))?$`,
  "iu",
);
