import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { withTestQuery } from "@/test/withTestQuery";
import { ClientAutoSendTab } from "./ClientAutoSendTab";
import { resetBackend } from "./fakeAutoSendBackend";

vi.mock("@/integrations/supabase/client", async () => ({
  supabase: (await import("./fakeAutoSendBackend")).fakeSupabase,
}));

/** The tab for client-1, with a fresh query client. */
function renderTab() {
  const { wrapper } = withTestQuery();
  return render(<ClientAutoSendTab clientId="client-1" />, { wrapper });
}

beforeEach(resetBackend);

describe("ClientAutoSendTab", () => {
  it("starts with every switch off and says nothing is sent by default", async () => {
    renderTab();
    expect(await screen.findAllByRole("switch")).toHaveLength(9);
    for (const toggle of screen.getAllByRole("switch")) {
      expect(toggle).not.toBeChecked();
    }
    expect(
      screen.getByText(/הלקוח לא מקבל שום הודעה אוטומטית/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/דוחות מתוזמנים נשלחים לפי התזמון/),
    ).toBeInTheDocument();
  });

  it("hides the refusal list while there are none", async () => {
    renderTab();
    await screen.findAllByRole("switch");
    expect(
      screen.queryByText(/שליחות אוטומטיות שנחסמו/),
    ).not.toBeInTheDocument();
  });
});
