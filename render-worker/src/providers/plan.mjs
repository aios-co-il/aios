/** ElevenLabs answers 402 / paid_plan_required when image, video or sound needs Pro. */
export function isPaidPlanError(error) {
  const text = String(error instanceof Error ? error.message : error).toLowerCase();
  return (
    text.includes("paid_plan_required") ||
    text.includes("paid_plan") ||
    text.includes("תוכנית pro") ||
    /\b402\b/.test(text)
  );
}
