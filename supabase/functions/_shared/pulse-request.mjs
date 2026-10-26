// JavaScript \b does not recognize Hebrew word boundaries.
export function hasPulseIntent(text) {
  return /(?:^|[^\p{L}\p{N}_])ה?דופק(?=$|[^\p{L}\p{N}_])|\bpulse\s*check\b|בדיקת\s*דוח|מצב\s*קמפיינים|סיכום\s*קמפיינים/iu.test(
    String(text || ""),
  );
}

// "רענני דופק", "דופק עדכני", the voice "בדיקת דופק מלאה ועדכנית": the caller
// wants the pulse recomputed now (refresh_campaign_pulse), not the stored one.
export function isPulseRefreshRequest(text) {
  const value = String(text || "");
  return (
    hasPulseIntent(value) &&
    /רענ[ןנו]|ריענון|עדכני|מעודכ[ןנ]|בזמן\s*אמת|מחדש|\brefresh|\bup[\s-]*to[\s-]*date\b|\bfresh\b/iu.test(
      value,
    )
  );
}

export function isCachedPulseRequest(text) {
  // Only unqualified summary requests may bypass the model with empty tool args.
  // Client filters, analysis, refresh and send instructions need normal routing.
  const normalized = String(text || "")
    .trim()
    .replace(/[.!?؟]+$/u, "")
    .trim();
  return /^(?:(?:כרמן|קרמן|carmen)[,\s]+)?(?:(?:תני לי|תן לי|הציגי|הצג|אפשר|מה|תראי לי|תראה לי)\s+)?(?:(?:בדיקת\s+)?דופק(?:\s+קמפיינים)?|(?:מצב|סיכום)\s*(?:הקמפיינים|קמפיינים)|pulse\s*check)(?:\s+בבקשה)?$/iu.test(
    normalized,
  );
}
