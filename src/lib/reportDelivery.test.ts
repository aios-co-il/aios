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
