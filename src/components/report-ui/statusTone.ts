/** The brand book's status chips; each tone follows the theme in light and dark. */
export type StatusTone = "active" | "progress" | "draft" | "danger";

/** Surface and text of each tone, for controls that should read as the chip. */
export const STATUS_TONE_CLASS: Record<StatusTone, string> = {
  active: "bg-status-active-surface text-status-foreground",
  progress: "bg-status-progress-surface text-status-foreground",
  draft: "bg-status-draft-surface text-status-foreground",
  danger: "bg-surface-status-red text-destructive",
};
