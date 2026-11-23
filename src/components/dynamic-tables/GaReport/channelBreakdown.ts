/**
 * Users, sessions and conversions of an Analytics period split into organic,
 * paid and everything else, so the three parts add up to the whole.
 */

export type TrafficKind = "organic" | "paid" | "other";

export type TrafficTotals = {
  sessions: number;
  users: number;
  conversions: number;
};

export type ChannelBreakdown = Record<TrafficKind, TrafficTotals>;

/** One stored GA row; the channel rows carry `channel_group`. */
type ChannelRecord = { data: Record<string, unknown> };

/** One aggregated source row of the report's sources table. */
type SourceTotals = TrafficTotals & { name: string };

/**
 * GA's paid default channel groups that do not start with "Paid": Google's
 * Performance Max and Demand Gen land in Cross-network.
 */
const OTHER_PAID_CHANNELS = new Set(["display", "cross-network", "audio"]);

/** Source/medium words that mark a paid visit when GA sent no channel group. */
const PAID_SOURCE_WORDS = [
  "cpc",
  "paid",
  "ppc",
  "ממומן",
  "cpm",
  "cpv",
  "display",
  "retargeting",
  "remarketing",
];

/** Organic, paid or other for a GA default channel group name. */
export function channelKind(channelGroup: string): TrafficKind {
  const name = channelGroup.trim().toLowerCase();
  if (name.startsWith("organic")) {
    return "organic";
  }
  if (name.startsWith("paid") || OTHER_PAID_CHANNELS.has(name)) {
    return "paid";
  }
  return "other";
}

/** Organic, paid or other for a source/medium name (legacy rows without a channel). */
export function sourceKind(sourceName: string): TrafficKind {
  const name = sourceName.toLowerCase();
  if (name.includes("organic") || name.includes("אורגני")) {
    return "organic";
  }
  if (PAID_SOURCE_WORDS.some((word) => name.includes(word))) {
    return "paid";
  }
  return "other";
}

/** The breakdown from GA channel rows, which match GA's Traffic acquisition report. */
export function breakdownFromChannels(
  records: ReadonlyArray<ChannelRecord>,
): ChannelBreakdown {
  const breakdown = emptyBreakdown();
  for (const record of records) {
    const totals =
      breakdown[channelKind(String(record.data.channel_group ?? ""))];
    totals.sessions += toNumber(record.data.sessions);
    totals.users += toNumber(record.data.users);
    totals.conversions += channelConversions(record.data);
  }
  return breakdown;
}

/** The breakdown from aggregated source rows, when no channel rows are stored. */
export function breakdownFromSources(
  sources: ReadonlyArray<SourceTotals>,
): ChannelBreakdown {
  const breakdown = emptyBreakdown();
  for (const source of sources) {
    const totals = breakdown[sourceKind(source.name)];
    totals.sessions += source.sessions;
    totals.users += source.users;
    totals.conversions += source.conversions;
  }
  return breakdown;
}

/** GA's "Key events" when stored, else conversions, else purchases. */
function channelConversions(data: Record<string, unknown>): number {
  return (
    toNumber(data.key_events) ||
    toNumber(data.conversions) ||
    toNumber(data.purchases)
  );
}

/** A breakdown with every part at zero. */
function emptyBreakdown(): ChannelBreakdown {
  return {
    organic: { sessions: 0, users: 0, conversions: 0 },
    paid: { sessions: 0, users: 0, conversions: 0 },
    other: { sessions: 0, users: 0, conversions: 0 },
  };
}

/** A stored figure as a number; anything unreadable counts as zero. */
function toNumber(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}
