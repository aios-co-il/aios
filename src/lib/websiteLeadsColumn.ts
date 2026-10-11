/** Website-lead column is real only when at least one row has a counted site lead.
 * Google Ads sync stamps verified_leads=0 on every campaign when a site is connected
 * but nothing is mapped, which is not a synced column.
 */
export function reportHasSyncedWebsiteLeads(
  records: Array<{ data?: { verified_leads?: number | null } | null } | null | undefined>,
): boolean {
  return records.some((record) => Number(record?.data?.verified_leads) > 0);
}
