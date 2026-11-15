/**
 * The manager-round checks an owner may run by hand (AIO-597): their ids (the
 * collector ids in carmen-manager-round/collectors/registry.ts) and Hebrew
 * labels, and what a run answers. One list for carmen-manager-round-run and
 * the settings screen. Imported by Vite and Deno, so it has no runtime imports.
 */
export const RUNNABLE_COLLECTORS = [
  {
    id: "chat_sla",
    label: "צ'אטים עם לקוחות",
    hint: "בקשות שלא נענו ותלונות",
  },
  {
    id: "group_updates",
    label: "עדכוני קבוצות",
    hint: "טיוטות עדכון לכרטיס הלקוח",
  },
  {
    id: "contact",
    label: "קשר עם לקוחות",
    hint: "שיחות שלא תועדו ולקוחות בלי קשר",
  },
] as const;

export type RunnableCollectorId = (typeof RUNNABLE_COLLECTORS)[number]["id"];

/** What one manual run of a check answers. */
export type CollectorRunResult = {
  /** The tenant's manager mode: in observe nothing was sent. */
  mode: string;
  status: "ok" | "skipped" | "error";
  /** Why the check did not run, or why it failed. */
  reason: string | null;
  candidates: number;
  inserted: number;
  cleared: number;
  llmCalls: number;
};

/** True when `id` names a check an owner may run. */
export function isRunnableCollector(id: unknown): id is RunnableCollectorId {
  return RUNNABLE_COLLECTORS.some((collector) => collector.id === id);
}
