// JavaScript \b does not recognize Hebrew word boundaries.
export function hasPulseIntent(text) {
  return /(?:^|[^\p{L}\p{N}_])ה?דופק(?=$|[^\p{L}\p{N}_])|\bpulse\s*check\b|בדיקת\s*דוח|מצב\s*קמפיינים|סיכום\s*קמפיינים/iu.test(
    String(text || ""),
  );
}

// Hebrew-aware word edges for the refresh matchers below.
const WORD_START = String.raw`(?<![\p{L}\p{N}_])`;
const WORD_END = String.raw`(?![\p{L}\p{N}_])`;
// "דופק", "הדופק", "בדיקת דופק", "בדיקת הדופק", "דופק הקמפיינים", "pulse check".
const PULSE_NOUN = String.raw`(?:(?:ה?בדיקת\s+)?ה?דופק(?:\s+ה?קמפיינים)?|pulse(?:\s*check)?)`;
// "רענני", "תרענני", "לרענן", "רענון", "ריענון", "refresh": only when they act
// on the pulse noun that follows.
const REFRESH_VERB = String.raw`(?:ת?רענ(?:ני|ן|נו)|לרענן|ר(?:י)?ענון|refresh)`;
// "עדכני", "העדכני", "עדכנית", "מעודכן", "המעודכנת", "מלאה ועדכנית". Adjectives
// right after the pulse noun only, so the verb "ותעדכני אותי" never counts.
const FRESH_ADJECTIVE = String.raw`(?:מלא[הת]?\s+ו?)?ה?(?:עדכני|מעודכ[ןנ])ת?`;
// "מחדש" counts only after a run or check verb: "תריצי את הדופק מחדש", not
// "תשלחי מחדש את הדופק" or a resumed task's "אל תתחיל מחדש".
const RERUN_VERB = String.raw`(?:תריצי|הריצי|תריץ|הרץ|תבדקי|בדקי|תבדוק|בדוק|תחשבי|חשבי|תחשב|חשב|תעשי|עשי|תעשה|עשה)`;

const REFRESH_PATTERNS = [
  // "רענני (את) (בדיקת) (ה)דופק", "רענון של הדופק", "refresh the pulse".
  new RegExp(
    `${WORD_START}ו?${REFRESH_VERB}\\s+(?:(?:את|של|the)\\s+)?${PULSE_NOUN}${WORD_END}`,
    "iu",
  ),
  // "(בדיקת) (ה)דופק (ה)עדכני / מעודכן / מלאה ועדכנית".
  new RegExp(
    `${WORD_START}${PULSE_NOUN}\\s+${FRESH_ADJECTIVE}${WORD_END}`,
    "iu",
  ),
  // "fresh pulse", "up-to-date pulse check", "updated pulse".
  /\b(?:fresh|up[\s-]*to[\s-]*date|updated)\s+pulse(?:\s*check)?\b/iu,
  // "תריצי (את) הדופק מחדש", "תבדקי מחדש את הדופק".
  new RegExp(
    `${WORD_START}ו?${RERUN_VERB}\\s+(?:(?:את\\s+)?${PULSE_NOUN}\\s+מחדש|מחדש\\s+(?:את\\s+)?${PULSE_NOUN})${WORD_END}`,
    "iu",
  ),
];

// "רענני דופק", "דופק עדכני", the voice "בדיקת דופק מלאה ועדכנית": the caller
// wants the pulse recomputed now (refresh_campaign_pulse), not the stored one.
// The refresh word must act on the pulse itself, so "מה הדופק? ותזכירי לי
// לרענן את הטופס" or "תשלחי מחדש את הדופק" stay ordinary requests.
export function isPulseRefreshRequest(text) {
  const value = String(text || "");
  return REFRESH_PATTERNS.some((pattern) => pattern.test(value));
}

function normalizeCommand(text) {
  return String(text || "")
    .trim()
    .replace(/[.!?؟]+$/u, "")
    .trim();
}

const BARE_PULSE = String.raw`(?:ה?בדיקת\s+)?ה?דופק(?:\s+ה?קמפיינים)?`;
const BARE_PULSE_REFRESH_RE = new RegExp(
  String.raw`^(?:(?:כרמן|קרמן|carmen)[,\s]+)?` +
    String.raw`(?:(?:תני לי|תן לי|הציגי|הצג|אפשר|מה|תראי לי|תראה לי|בבקשה)\s+)?` +
    String.raw`(?:(?:ת?רענ(?:ני|ן)|רענון|ריענון)\s+(?:(?:את|של)\s+)?${BARE_PULSE}` +
    String.raw`|${BARE_PULSE}\s+${FRESH_ADJECTIVE}` +
    String.raw`|(?:תריצי|הריצי)\s+(?:את\s+)?${BARE_PULSE}\s+מחדש` +
    String.raw`|refresh\s+(?:the\s+)?pulse(?:\s*check)?)` +
    String.raw`(?:\s+לפי\s+ה?סוכנויות)?(?:\s+(?:עכשיו|בבקשה))?$`,
  "iu",
);

// Only a refresh request with nothing else in it may skip the model and answer
// with the digest. A send, reminder, schedule or second clause keeps normal
// routing, and so do the group, identity and isolation notes that WhatsApp
// appends to every message.
export function isBarePulseRefreshRequest(text) {
  return BARE_PULSE_REFRESH_RE.test(normalizeCommand(text));
}

export function isCachedPulseRequest(text) {
  // Only unqualified summary requests may bypass the model with empty tool args.
  // Client filters, analysis, refresh and send instructions need normal routing.
  return /^(?:(?:כרמן|קרמן|carmen)[,\s]+)?(?:(?:תני לי|תן לי|הציגי|הצג|אפשר|מה|תראי לי|תראה לי)\s+)?(?:(?:בדיקת\s+)?דופק(?:\s+קמפיינים)?|(?:מצב|סיכום)\s*(?:הקמפיינים|קמפיינים)|pulse\s*check)(?:\s+בבקשה)?$/iu.test(
    normalizeCommand(text),
  );
}

// The roles run-ai-agent resolves for a caller; all of them are AIOS staff.
const STAFF_ROLES = new Set([
  "super_admin",
  "owner",
  "agency_owner",
  "agency_manager",
  "team_manager",
  "campaigner",
  "sales_person",
  "seo",
  "viewer",
]);

/**
 * A caller run-ai-agent identified as staff: a campaigner matched by phone, or
 * a user with a staff role. WhatsApp client contacts and unknown senders have
 * neither.
 */
export function isStaffPulseCaller({ campaignerId, userId, role } = {}) {
  if (campaignerId) return true;
  return Boolean(userId) && STAFF_ROLES.has(String(role || ""));
}

/**
 * How run-ai-agent routes a pulse refresh request (AIO-237).
 *   forceRefresh   round 0 must call refresh_campaign_pulse. A compound
 *                  request ("שלחי לפליקס את הדופק המעודכן") still goes on to
 *                  round 1, so the model can send or schedule.
 *   digestShortcut on WhatsApp and task surfaces, answer with refresh_note and
 *                  the digest and end the turn. Bare requests only.
 * Neither applies outside Carmen, in isolated sessions, or to non-staff callers.
 */
export function decidePulseRefreshRouting({
  text,
  isCarmen,
  pinSkillsOnly = false,
  digestSurface = false,
  caller,
} = {}) {
  if (!isCarmen || pinSkillsOnly || !isStaffPulseCaller(caller)) {
    return { forceRefresh: false, digestShortcut: false };
  }
  const forceRefresh = isPulseRefreshRequest(text);
  return {
    forceRefresh,
    digestShortcut:
      forceRefresh && Boolean(digestSurface) && isBarePulseRefreshRequest(text),
  };
}
