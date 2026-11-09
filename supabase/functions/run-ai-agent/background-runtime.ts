/** Supabase's optional global background-work binding; this declaration adds no runtime fallback. */
export interface BackgroundRuntime {
  waitUntil(work: Promise<unknown>): void;
}
