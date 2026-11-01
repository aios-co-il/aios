import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { resolveCarmenReportRecipients } from "../../../../supabase/functions/_shared/carmen-report-recipients/resolve.ts";
import {
  ReportRecipientList,
  type ReportRecipientRow,
} from "./ReportRecipientList";

const FELIX = {
  user_id: "u-felix",
  full_name: "פליקס",
  phone: "0500000011",
  is_owner: true,
};

/** The list as the settings screen renders it, resolved like the server. */
function renderList(rows: ReportRecipientRow[], staff = [FELIX]) {
  render(
    <ReportRecipientList
      rows={rows}
      staff={staff}
      resolved={resolveCarmenReportRecipients({ configured: rows, staff })}
      removing={false}
      onRemove={() => {}}
    />,
  );
  return screen.getByRole("list", { name: "נמעני הדיווח" });
}

describe("ReportRecipientList", () => {
  it("warns only on the duplicate of two extra phones with one label", () => {
    const list = renderList([
      { id: "r1", user_id: "u-felix", phone: null, label: null },
      { id: "r2", user_id: null, phone: "+972500000011", label: "משרד" },
      { id: "r3", user_id: null, phone: "+972500000012", label: "משרד" },
    ]);

    const [duplicate, other] = within(list)
      .getAllByText("משרד")
      .map((label) => label.closest("li"));
    expect(duplicate).toHaveTextContent("אותו טלפון כבר ברשימה");
    expect(other).not.toHaveTextContent("אותו טלפון כבר ברשימה");
  });

  it("names rows without a card name or label as the server does", () => {
    const list = renderList(
      [
        { id: "r1", user_id: "u-felix", phone: null, label: null },
        { id: "r2", user_id: null, phone: "+972500000012", label: "  " },
      ],
      [{ ...FELIX, full_name: "  " }],
    );

    expect(within(list).getByText("חבר צוות")).toBeInTheDocument();
    expect(within(list).getByText("מספר נוסף")).toBeInTheDocument();
  });
});
