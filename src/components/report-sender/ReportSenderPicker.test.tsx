import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { reportSender } from "@/test/reportSenderFixture";
import { ReportSenderPicker } from "./ReportSenderPicker";
import type { ReportSenderChoice } from "./useReportSenderChoice";

const GROUP = "120363416882903532@g.us";

const carmen = reportSender("carmen", {
  integration_type: "manus_wa",
  group_chat_ids: [GROUP],
});
const david = reportSender("david", { owner_name: "דוד" });

function choice(overrides: Partial<ReportSenderChoice>): ReportSenderChoice {
  return {
    senders: [],
    pick: { error: "no_report_sender" },
    choose: vi.fn(),
    ...overrides,
  };
}

describe("ReportSenderPicker", () => {
  it("says there is no phone when the tenant has none", () => {
    render(<ReportSenderPicker choice={choice({})} />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "אין טלפון וואטסאפ מחובר לשליחת דוחות",
    );
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("shows the only phone instead of offering a choice (a Manus-only tenant)", () => {
    render(
      <ReportSenderPicker
        choice={choice({
          senders: [carmen, reportSender("off", { ready: false })],
          pick: { sender: carmen, type: "manus_wa", source: "only_sender" },
        })}
      />,
    );
    expect(screen.getByText(/יישלח מ:/)).toHaveTextContent(
      "יישלח מ: הטלפון של כרמן",
    );
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("offers a choice between several phones, preselected", () => {
    render(
      <ReportSenderPicker
        choice={choice({
          senders: [carmen, david],
          pick: { sender: david, type: "green_api", source: "own_line" },
        })}
      />,
    );
    expect(screen.getByRole("combobox", { name: "שלח מ" })).toHaveTextContent(
      "הטלפון של דוד",
    );
  });

  it("asks for a choice when nothing decides it", () => {
    render(
      <ReportSenderPicker
        choice={choice({
          senders: [carmen, david],
          pick: { error: "choose_sender" },
        })}
      />,
    );
    expect(screen.getByRole("combobox", { name: "שלח מ" })).toBeInTheDocument();
    expect(screen.getByText("בחרו מאיזה טלפון לשלוח")).toBeInTheDocument();
  });

  it("offers a line another organization shared instead of using it", () => {
    const shared = reportSender("shared", {
      integration_type: "manus_wa",
      is_shared: true,
    });
    render(
      <ReportSenderPicker
        choice={choice({ senders: [shared], pick: { error: "choose_sender" } })}
      />,
    );
    expect(screen.getByRole("combobox", { name: "שלח מ" })).toBeInTheDocument();
    expect(screen.queryByText(/יישלח מ:/)).not.toBeInTheDocument();
  });

  it("asks for a new organization default when the default cannot send", () => {
    render(
      <ReportSenderPicker
        choice={choice({
          senders: [carmen],
          pick: { error: "sender_not_allowed", refused: "tenant_default" },
        })}
      />,
    );
    expect(screen.getByRole("combobox", { name: "שלח מ" })).toBeInTheDocument();
    expect(
      screen.getByText(/בעלי הארגון צריכים לבחור ברירת מחדל חדשה/),
    ).toBeInTheDocument();
  });

  it("warns when Carmen's phone is not in the chosen group", () => {
    const pick = {
      sender: carmen,
      type: "manus_wa" as const,
      source: "only_sender" as const,
    };
    const { rerender } = render(
      <ReportSenderPicker
        choice={choice({ senders: [carmen], pick })}
        groupChatId="other@g.us"
      />,
    );
    expect(
      screen.getByText("הטלפון שנבחר לא חבר בקבוצה הזו"),
    ).toBeInTheDocument();
    rerender(
      <ReportSenderPicker
        choice={choice({ senders: [carmen], pick })}
        groupChatId={GROUP}
      />,
    );
    expect(
      screen.queryByText("הטלפון שנבחר לא חבר בקבוצה הזו"),
    ).not.toBeInTheDocument();
  });

  it("waits while the phones load", () => {
    render(
      <ReportSenderPicker choice={choice({ pick: { error: "loading" } })} />,
    );
    expect(screen.getByText(/טוען את טלפוני השליחה/)).toBeInTheDocument();
  });
});
