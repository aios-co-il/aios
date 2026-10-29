/** ElevenLabs answers 402 / paid_plan_required when image, video or sound needs Pro. */
export function isPaidPlanError(error) {
  const text = String(
    error instanceof Error ? error.message : error,
  ).toLowerCase();
  return (
    text.includes("paid_plan_required") ||
    text.includes("paid_plan") ||
    text.includes("תוכנית pro") ||
    /\b402\b/.test(text)
  );
}

/** ElevenLabs refusing the key itself (invalid, or out of quota): another route may still work. */
export function isRejectedKeyError(error) {
  const text = String(
    error instanceof Error ? error.message : error,
  ).toLowerCase();
  return (
    /\b401\b/.test(text) ||
    text.includes("invalid_api_key") ||
    text.includes("quota_exceeded")
  );
}
