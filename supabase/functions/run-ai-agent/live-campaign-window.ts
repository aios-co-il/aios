/** The day span of Carmen's live Meta campaign read. */

/**
 * The last `days` full days before `now` (UTC dates, ending yesterday), the
 * span Meta's last_N_days presets cover.
 */
export function liveCampaignWindow(
  days: number,
  now: Date,
): { start: string; end: string } {
  const count = Math.max(1, Math.floor(Number(days)) || 1);
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1),
  );
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (count - 1));
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}
