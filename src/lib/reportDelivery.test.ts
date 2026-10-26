import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { reportDeliveryOutcome } from "./reportDelivery";

describe("reportDeliveryOutcome", () => {
  const both = { whatsapp: true, email: true };

  it("is sent when every requested channel went out", () => {
    expect(
      reportDeliveryOutcome({ requested: both, sent: ["email", "whatsapp"] }),
    ).toEqual({ status: "sent", channels: ["whatsapp", "email"] });
    expect(
      reportDeliveryOutcome({
        requested: { whatsapp: false, email: true },
        sent: ["email"],
      }),
    ).toEqual({ status: "sent", channels: ["email"] });
  });

  it("is partial with only the channels that went out", () => {
    // WhatsApp went out, then the email failed: the client still got the report.
    expect(
      reportDeliveryOutcome({ requested: both, sent: ["whatsapp"] }),
    ).toEqual({ status: "partial", channels: ["whatsapp"] });
  });

  it("records nothing when nothing went out", () => {
    expect(reportDeliveryOutcome({ requested: both, sent: [] })).toBeNull();
    // A channel that was not requested never counts.
    expect(
      reportDeliveryOutcome({
        requested: { whatsapp: false, email: true },
        sent: ["whatsapp"],
      }),
    ).toBeNull();
  });
});

describe("manual senders record what reached the client", () => {
  const senders = [
    "src/components/clients/ClientReportPanel.tsx",
    "src/components/clients/ClientDashboardPanel.tsx",
    "src/components/dynamic-tables/SendReportDialog.tsx",
    "src/components/recordings/ShareSummaryDialog.tsx",
  ];

  it.each(senders)("%s", (path) => {
    const src = readFileSync(resolve(process.cwd(), path), "utf8");
    const send = src.slice(src.indexOf("const handleSend = async"));
    // Each channel is counted only after it went out ...
    expect(send).toMatch(/sentChannels\.push\("whatsapp"\)/);
    expect(send).toMatch(/sentChannels\.push\("email"\)/);
    // ... and the delivery is recorded in `finally`, so a later failure or an
    // early return after a channel went out still leaves a (partial) row.
    const finallyBlock = send.slice(send.indexOf("} finally {"));
    expect(finallyBlock).toMatch(/await record\w*Delivery\(sentChannels[,)]/);
    expect(src).toMatch(/reportDeliveryOutcome\(\{/);
    expect(src).toMatch(/status: outcome\.status,/);
    expect(src).toMatch(/channels: outcome\.channels,/);
    expect(src).not.toMatch(/status: "sent",/);
  });

  it("the meeting summary keeps its date out of the quoted title", () => {
    const src = readFileSync(
      resolve(
        process.cwd(),
        "src/components/recordings/ShareSummaryDialog.tsx",
      ),
      "utf8",
    );
    expect(src).toMatch(/title: meetingName,/);
    expect(src).toMatch(/meeting_date: meetingDate \|\| null,/);
    expect(src).toMatch(/queryKey: \["client-updates", recording\.client_id\]/);
  });
});
