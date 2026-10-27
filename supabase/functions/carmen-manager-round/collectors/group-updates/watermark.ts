/**
 * The group-updates collector's watermark: the earliest time it may read
 * (its first run, so nothing from before it is digested), per group the last
 * message already digested or found covered by the card, and the lines the
 * run read (read_lines), by which another tenant's run leaves a shared group
 * to this one (get_client_group_digest_messages).
 */
import type { Json } from "../../../_shared/database.types.ts";

/** A group's window never reaches further back than this. */
export const LOOKBACK_DAYS = 7;

const DAY_MS = 86_400_000;

export type GroupMark = { at: string; id: string };

export type GroupWatermark = {
  floor: string;
  /** By group id (the tenant's own whatsapp_groups row). */
  groups: Record<string, GroupMark>;
};

/** The stored watermark, or a fresh one floored at `since` (the first run). */
export function parseWatermark(raw: Json | null, since: Date): GroupWatermark {
  const stored = record(raw);
  const floor = typeof stored?.floor === "string" ? stored.floor : null;
  const groups: Record<string, GroupMark> = {};
  for (const [groupId, mark] of Object.entries(record(stored?.groups) ?? {})) {
    const entry = record(mark ?? null);
    if (typeof entry?.at === "string" && typeof entry.id === "string") {
      groups[groupId] = { at: entry.at, id: entry.id };
    }
  }
  return { floor: floor ?? since.toISOString(), groups };
}

/** The earliest message time any group's window may start after. */
export function readFrom(watermark: GroupWatermark, now: Date): Date {
  const lookback = now.getTime() - LOOKBACK_DAYS * DAY_MS;
  return new Date(Math.max(Date.parse(watermark.floor), lookback));
}

/** The watermark with `marks` applied and marks older than the lookback dropped. */
export function advance(
  watermark: GroupWatermark,
  marks: Record<string, GroupMark>,
  now: Date,
): GroupWatermark {
  const lookback = now.getTime() - LOOKBACK_DAYS * DAY_MS;
  const groups = Object.fromEntries(
    Object.entries({ ...watermark.groups, ...marks }).filter(
      ([, mark]) => Date.parse(mark.at) >= lookback,
    ),
  );
  return { floor: watermark.floor, groups };
}

/** The watermark as stored JSON, with the lines this run read. */
export function watermarkJson(
  watermark: GroupWatermark,
  readLines: string[],
): Json {
  return {
    floor: watermark.floor,
    groups: watermark.groups,
    read_lines: readLines,
  };
}

/** A plain JSON object, or null. */
function record(
  value: Json | null | undefined,
): { [key: string]: Json | undefined } | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : null;
}
