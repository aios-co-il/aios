import type { RecordsClient } from "./campaign-records.ts";

/**
 * The service client as the paged reader sees it. Checking the generated
 * client against RecordsClient compares every table's query builder and hits
 * TypeScript's depth limit (TS2589), so the check stops at `from`.
 */
export function asRecordsClient(client: {
  from(table: "crm_records"): unknown;
}): RecordsClient {
  return client as RecordsClient;
}
