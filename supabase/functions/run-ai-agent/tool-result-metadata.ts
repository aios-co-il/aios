/**
 * Fields existing callers inspect on opaque executor results. The metadata type is
 * only a view: the original result is returned and recorded without normalization.
 */
export interface ToolResultMetadata {
  pending_approval?: unknown;
  approval_id?: unknown;
  success?: unknown;
  message?: unknown;
  error?: unknown;
  whatsapp_digest?: unknown;
  refresh_note?: unknown;
  say_to_user?: unknown;
  needs_budget?: unknown;
  sub_task_id?: unknown;
  ui_action?: unknown;
  workshop?: unknown;
  image_url?: unknown;
}

/** Narrows the metadata view without changing the original executor result. */
export function toolResultMetadata(
  result: unknown,
): ToolResultMetadata | undefined {
  return typeof result === "object" && result !== null ? result : undefined;
}
