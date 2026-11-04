import { resolveCampaignDeliveryStatus } from "@/lib/pulseCampaignGoals";

/** A report record as every campaign report receives it. */
export type CampaignOffRecord = {
  table_id?: string;
  _tableId?: string;
  data?: Record<string, unknown> | null;
};

/** The part of a report table (crm_tables) that says whether its campaign is switched off. */
export type CampaignOffTable = {
  id: string;
  campaign_active?: boolean | null;
};

/**
 * The one rule for campaign rows in reports: a campaign that is on shows,
 * and a campaign that is off shows only when it spent in the report period.
 */
export function showCampaignRow(row: { off: boolean; spend: number }): boolean {
  return !row.off || row.spend > 0;
}

/**
 * A campaign is off when its report is switched off (`campaign_active`) or
 * the platform says it is paused or removed. An unknown status is not off:
 * Google Ads records carry no campaign status, so only the report switch
 * can turn a Google campaign off.
 */
export function isCampaignOff(input: {
  deliveryStatus?: string | null;
  reportActive?: boolean | null;
}): boolean {
  return (
    input.reportActive === false ||
    input.deliveryStatus === "paused" ||
    input.deliveryStatus === "removed"
  );
}

/** Ids of the report tables that are switched off. */
export function switchedOffTableIds(
  tables: Array<CampaignOffTable> | null | undefined,
): Set<string> {
  return new Set(
    (tables ?? [])
      .filter((table) => table.campaign_active === false)
      .map((table) => table.id),
  );
}

/**
 * Whether a record's report is switched off. Single-table reports send
 * records without a table id, so one table stands for all of them.
 */
export function reportOffLookup(
  tables: Array<CampaignOffTable> | null | undefined,
): (record: CampaignOffRecord) => boolean {
  const list = tables ?? [];
  const offIds = switchedOffTableIds(list);
  const onlyTableId = list.length === 1 ? list[0].id : null;
  return (record) => {
    const tableId = record.table_id ?? record._tableId ?? onlyTableId;
    return !!tableId && offIds.has(tableId);
  };
}

/**
 * Keys of the campaigns that are off. The platform status comes from the
 * campaign's latest dated record that has one, since each sync stamps the
 * campaign's status at that time on the rows it writes.
 */
export function campaignOffKeys<T extends CampaignOffRecord>(
  records: Array<T>,
  keyOf: (data: Record<string, unknown>, record: T) => string,
  isReportOff: (record: T) => boolean = () => false,
): Set<string> {
  const latest = new Map<string, { date: string; status: string }>();
  const reportOff = new Set<string>();
  for (const record of records) {
    const data = record.data ?? {};
    const key = keyOf(data, record);
    if (isReportOff(record)) {
      reportOff.add(key);
    }
    const status = resolveCampaignDeliveryStatus(data);
    if (status === "unknown") {
      continue;
    }
    const date = typeof data.date === "string" ? data.date : "";
    const previous = latest.get(key);
    if (!previous || date >= previous.date) {
      latest.set(key, { date, status });
    }
  }
  const off = new Set(reportOff);
  for (const [key, { status }] of latest) {
    if (isCampaignOff({ deliveryStatus: status })) {
      off.add(key);
    }
  }
  return off;
}

/** Marks each row on or off and drops the off rows that spent nothing. */
export function applyCampaignOffRule<T extends object>(
  rows: Array<T>,
  options: {
    keyOf: (row: T) => string;
    spendOf: (row: T) => number;
    offKeys: Set<string>;
  },
): Array<T & { off: boolean }> {
  return rows
    .map((row) => ({ ...row, off: options.offKeys.has(options.keyOf(row)) }))
    .filter((row) =>
      showCampaignRow({ off: row.off, spend: options.spendOf(row) }),
    );
}
