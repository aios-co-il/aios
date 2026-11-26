import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { withTestQuery } from "@/test/withTestQuery";
import { LandingSettingsPanel } from "./LandingSettingsPanel";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  page: null as Record<string, unknown> | null,
  site: null as Record<string, unknown> | null,
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: mocks.rpc,
    from: (table: string) => {
      const chain: Record<string, unknown> = {
        maybeSingle: async () => ({
          data: table === "landing_pages" ? mocks.page : mocks.site,
          error: null,
        }),
      };
      for (const method of ["select", "eq"]) {
        chain[method] = () => chain;
      }
      return chain;
    },
  },
}));

/** Renders the panel for one project of one client. */
function panel() {
  return render(
    withTestQuery(
      <LandingSettingsPanel tenantId="t1" itemId="p1" clientId="c1" />,
    ),
  );
}

describe("LandingSettingsPanel", () => {
  beforeEach(() => {
    mocks.rpc.mockReset();
    mocks.rpc.mockResolvedValue({ error: null });
    mocks.page = null;
    mocks.site = null;
    localStorage.clear();
  });

  test("an existing page shows its live address and locks it", async () => {
    mocks.page = {
      slug: "cyber",
      lead_to_crm: false,
      lead_to_webhook: true,
      landing_sites: { subdomain: "acme" },
    };
    panel();
    const link = await screen.findByRole("link", {
      name: /acme\.aios\.co\.il\/cyber/,
    });
    expect(link.getAttribute("href")).toBe("https://acme.aios.co.il/cyber");
    expect(screen.getByLabelText("תת־דומיין של הלקוח")).toBeDisabled();
    expect(screen.getByLabelText("כתובת העמוד")).toBeDisabled();
  });

  test("a stored webhook URL is never shown, and saving without a new one keeps it", async () => {
    mocks.page = {
      slug: "home",
      lead_to_crm: false,
      lead_to_webhook: true,
      landing_sites: { subdomain: "acme" },
    };
    const user = userEvent.setup();
    panel();
    const url = await screen.findByLabelText("כתובת הוובהוק");
    expect(url).toHaveValue("");
    await user.click(screen.getByRole("switch", { name: "ל-CRM של הארגון" }));
    await user.click(screen.getByRole("button", { name: "שמירה" }));
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledOnce());
    expect(mocks.rpc).toHaveBeenCalledWith("landing_page_save_settings", {
      p_item_id: "p1",
      p_subdomain: "acme",
      p_slug: "home",
      p_lead_to_crm: true,
      p_lead_to_webhook: true,
      p_webhook_url: undefined,
    });
  });

  test("a new page cannot be saved to a webhook without a URL", async () => {
    mocks.site = { subdomain: "acme" };
    const user = userEvent.setup();
    panel();
    await user.click(await screen.findByRole("switch", { name: "לוובהוק" }));
    expect(screen.getByRole("button", { name: "שמירה" })).toBeDisabled();
    await user.type(
      screen.getByLabelText("כתובת הוובהוק"),
      "https://hooks.example/a",
    );
    await user.click(screen.getByRole("button", { name: "שמירה" }));
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledOnce());
    expect(mocks.rpc.mock.calls[0][1]).toMatchObject({
      p_slug: "home",
      p_lead_to_webhook: true,
      p_webhook_url: "https://hooks.example/a",
    });
  });

  test("the panel closes to show the page below, keeps the draft and stays closed next time", async () => {
    mocks.site = { subdomain: "acme" };
    const user = userEvent.setup();
    const { unmount } = panel();
    const slug = await screen.findByLabelText("כתובת העמוד");
    await user.clear(slug);
    await user.type(slug, "offer");
    await user.click(
      screen.getByRole("button", { name: "הסתרת הגדרות עמוד נחיתה" }),
    );
    expect(screen.queryByRole("button", { name: "שמירה" })).toBeNull();
    await user.click(
      screen.getByRole("button", { name: "הצגת הגדרות עמוד נחיתה" }),
    );
    expect(screen.getByLabelText("כתובת העמוד")).toHaveValue("offer");

    await user.click(
      screen.getByRole("button", { name: "הסתרת הגדרות עמוד נחיתה" }),
    );
    unmount();
    panel();
    expect(
      await screen.findByRole("button", { name: "הצגת הגדרות עמוד נחיתה" }),
    ).toBeInTheDocument();
  });
});
