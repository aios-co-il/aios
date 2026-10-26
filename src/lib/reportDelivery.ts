// The report_deliveries row a manual send records (AIO-242). That row is the
// client card's only log of a report, dashboard share or meeting summary, so
// it records what actually reached the client: every requested channel went
// out → "sent"; some went out before a later one failed or was skipped →
// "partial" with only the channels that went out; none went out → no row.

export type ReportDeliveryChannel = "whatsapp" | "email";

export type ReportDeliveryOutcome = {
  status: "sent" | "partial";
  channels: ReportDeliveryChannel[];
};

export function reportDeliveryOutcome(input: {
  requested: { whatsapp: boolean; email: boolean };
  sent: readonly ReportDeliveryChannel[];
}): ReportDeliveryOutcome | null {
  const requested: ReportDeliveryChannel[] = [
    ...(input.requested.whatsapp ? (["whatsapp"] as const) : []),
    ...(input.requested.email ? (["email"] as const) : []),
  ];
  const channels = requested.filter((channel) => input.sent.includes(channel));
  if (channels.length === 0) return null;
  return {
    status: channels.length === requested.length ? "sent" : "partial",
    channels,
  };
}
