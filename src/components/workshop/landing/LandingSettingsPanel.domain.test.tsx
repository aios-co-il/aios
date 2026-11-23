import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { withTestQuery } from "@/test/withTestQuery";
import { LandingSettingsPanel } from "./LandingSettingsPanel";

/** The client's site as the settings read selects it. */
interface SiteRow {
  subdomain: string;
  gtm_id: string | null;
  ga4_id: string | null;
  meta_pixel_id: string | null;
  custom_domain: string | null;
  custom_domain_verified_at: string | null;
}

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  invoke: vi.fn(),
  site: null as SiteRow | null,
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@/lib/edgeFunctionInvoke", () => ({
  invokeEdgeFunction: mocks.invoke,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: mocks.rpc,
    from: (table: string) => {
      const chain: Record<string, unknown> = {
        maybeSingle: async () => ({
          data:
            table === "landing_pages" && mocks.site
              ? {
                  slug: "home",
                  lead_to_crm: true,
                  lead_to_webhook: false,
                  landing_sites: mocks.site,
                }
              : null,
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

const CNAME = { type: "CNAME", name: "lp", value: "cname.vercel-dns.com" };

/** Renders the panel for one project of one client. */
function panel() {
  return render(
    withTestQuery(
      <LandingSettingsPanel tenantId="t1" itemId="p1" clientId="c1" />,
    ),
  );
}

describe("LandingSettingsPanel domain", () => {
  beforeEach(() => {
    mocks.rpc.mockReset();
    mocks.rpc.mockResolvedValue({ error: null });
    mocks.invoke.mockReset();
    mocks.site = {
      subdomain: "acme",
      gtm_id: null,
      ga4_id: null,
      meta_pixel_id: null,
      custom_domain: null,
      custom_domain_verified_at: null,
    };
  });

  test("saves the domain, connects it and shows the record to add", async () => {
    mocks.invoke.mockResolvedValue({
      available: true,
      domain: "lp.acme.co.il",
      connected: true,
      verified: false,
      records: [CNAME],
    });
    mocks.rpc.mockImplementation(async () => {
      if (mocks.site) {
        mocks.site = { ...mocks.site, custom_domain: "lp.acme.co.il" };
      }
      return { error: null };
    });
    const user = userEvent.setup();
    panel();
    await user.type(await screen.findByLabelText("דומיין"), " LP.Acme.co.il");
    await user.click(screen.getByRole("button", { name: "שמירת דומיין" }));
    await waitFor(() =>
      expect(mocks.invoke).toHaveBeenCalledWith("landing-domain", {
        action: "connect",
        item_id: "p1",
      }),
    );
    expect(mocks.rpc).toHaveBeenCalledWith("landing_site_save_domain", {
      p_item_id: "p1",
      p_domain: "lp.acme.co.il",
    });
    expect(
      await screen.findByRole("button", {
        name: "העתקת cname.vercel-dns.com",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("CNAME")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("עוד לא מאומת");
  });

  test("a hostname with a scheme or on aios.co.il cannot be saved", async () => {
    const user = userEvent.setup();
    panel();
    const field = await screen.findByLabelText("דומיין");
    await user.type(field, "https://lp.acme.co.il");
    expect(screen.getByRole("button", { name: "שמירת דומיין" })).toBeDisabled();
    expect(screen.getByText(/הדומיין לא תקין/)).toBeInTheDocument();
    await user.clear(field);
    await user.type(field, "acme.aios.co.il");
    expect(screen.getByText(/תת־הדומיין של האתר/)).toBeInTheDocument();
  });

  test("the check button shows the domain verified", async () => {
    mocks.site = {
      ...(mocks.site as SiteRow),
      custom_domain: "lp.acme.co.il",
    };
    mocks.invoke.mockResolvedValue({
      available: true,
      domain: "lp.acme.co.il",
      connected: true,
      verified: true,
      records: [],
    });
    const user = userEvent.setup();
    panel();
    expect(await screen.findByLabelText("דומיין")).toHaveValue("lp.acme.co.il");
    await user.click(screen.getByRole("button", { name: "בדיקה" }));
    expect(mocks.invoke).toHaveBeenCalledWith("landing-domain", {
      action: "status",
      item_id: "p1",
    });
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("הדומיין מאומת"),
    );
  });

  test("outside Production the answer says so", async () => {
    mocks.site = {
      ...(mocks.site as SiteRow),
      custom_domain: "lp.acme.co.il",
    };
    mocks.invoke.mockResolvedValue({
      available: false,
      message: "חיבור דומיין זמין רק ב-Production.",
    });
    const user = userEvent.setup();
    panel();
    await user.click(await screen.findByRole("button", { name: "בדיקה" }));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "זמין רק ב-Production",
      ),
    );
  });

  test("a domain save keeps unsaved tracking edits", async () => {
    mocks.invoke.mockResolvedValue({
      available: true,
      domain: "lp.acme.co.il",
      connected: true,
      verified: false,
      records: [CNAME],
    });
    mocks.rpc.mockImplementation(async () => {
      if (mocks.site) {
        mocks.site = { ...mocks.site, custom_domain: "lp.acme.co.il" };
      }
      return { error: null };
    });
    const user = userEvent.setup();
    panel();
    await user.type(
      await screen.findByLabelText("Google Analytics 4"),
      "G-ABC1234",
    );
    await user.type(screen.getByLabelText("דומיין"), "lp.acme.co.il");
    await user.click(screen.getByRole("button", { name: "שמירת דומיין" }));
    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledOnce());
    await waitFor(() => expect(screen.getByLabelText("דומיין")).toBeEnabled());
    expect(screen.getByLabelText("Google Analytics 4")).toHaveValue(
      "G-ABC1234",
    );
  });

  test("a client without a site saves its address before a domain", async () => {
    mocks.site = null;
    panel();
    expect(
      await screen.findByText(
        "אחרי שמירת כתובת האתר אפשר להוסיף לו קודי מעקב ודומיין.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("דומיין")).toBeNull();
  });
});
