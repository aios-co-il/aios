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
  toastError: vi.fn(),
  site: null as SiteRow | null,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: mocks.toastError },
}));

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

/** landing-domain's answer for a connected, unverified domain with its CNAME. */
function pending(domain: string, target: string) {
  return {
    available: true,
    domain,
    connected: true,
    verified: false,
    records: [{ type: "CNAME", name: "lp", value: target }],
  };
}

/** The domain RPC stores what it is given, as the database does. */
function storeDomains() {
  mocks.rpc.mockImplementation(
    async (_name: string, args: { p_domain: string }) => {
      if (mocks.site) {
        mocks.site = { ...mocks.site, custom_domain: args.p_domain || null };
      }
      return { error: null };
    },
  );
}

/** Renders the panel for one project of one client. */
function panel() {
  return render(
    withTestQuery(
      <LandingSettingsPanel tenantId="t1" itemId="p1" clientId="c1" />,
    ),
  );
}

describe("LandingSettingsPanel domain failures", () => {
  beforeEach(() => {
    mocks.rpc.mockReset();
    mocks.invoke.mockReset();
    mocks.toastError.mockReset();
    storeDomains();
    mocks.site = {
      subdomain: "acme",
      gtm_id: null,
      ga4_id: null,
      meta_pixel_id: null,
      custom_domain: null,
      custom_domain_verified_at: null,
    };
  });

  test("a connection that fails after the save can be retried", async () => {
    mocks.invoke
      .mockRejectedValueOnce(new Error("החיבור ל-Vercel נכשל"))
      .mockResolvedValueOnce(pending("lp.acme.co.il", "cname.vercel-dns.com"));
    const user = userEvent.setup();
    panel();
    await user.type(
      await screen.findByLabelText("Google Analytics 4"),
      "G-ABC1234",
    );
    await user.type(screen.getByLabelText("דומיין"), "lp.acme.co.il");
    await user.click(screen.getByRole("button", { name: "שמירת דומיין" }));
    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith("החיבור ל-Vercel נכשל"),
    );
    // The domain was saved, so the same domain connects again.
    const reconnect = await screen.findByRole("button", {
      name: "חיבור מחדש",
    });
    await waitFor(() => expect(reconnect).toBeEnabled());
    expect(screen.getByLabelText("Google Analytics 4")).toHaveValue(
      "G-ABC1234",
    );
    await user.click(reconnect);
    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(2));
    expect(
      await screen.findByRole("button", {
        name: "העתקת cname.vercel-dns.com",
      }),
    ).toBeInTheDocument();
  });

  test("a refused save keeps the draft for another try", async () => {
    mocks.rpc.mockResolvedValueOnce({
      error: new Error("הדומיין lp.acme.co.il כבר משמש אתר אחר"),
    });
    const user = userEvent.setup();
    panel();
    await user.type(await screen.findByLabelText("דומיין"), "lp.acme.co.il");
    await user.click(screen.getByRole("button", { name: "שמירת דומיין" }));
    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith(
        "הדומיין lp.acme.co.il כבר משמש אתר אחר",
      ),
    );
    expect(mocks.invoke).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.getByLabelText("דומיין")).toHaveValue("lp.acme.co.il"),
    );
  });

  test("a failed or malformed check is reported, and a retry succeeds", async () => {
    mocks.site = {
      ...(mocks.site as SiteRow),
      custom_domain: "lp.acme.co.il",
    };
    mocks.invoke
      .mockRejectedValueOnce(new Error("החיבור ל-Vercel נכשל"))
      .mockResolvedValueOnce({ available: true, records: "none" })
      .mockResolvedValueOnce({
        ...pending("lp.acme.co.il", "x"),
        verified: true,
      });
    const user = userEvent.setup();
    panel();
    const check = await screen.findByRole("button", { name: "בדיקה" });
    await user.click(check);
    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith("החיבור ל-Vercel נכשל"),
    );
    await user.click(check);
    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith(
        "תשובה לא צפויה מחיבור הדומיין",
      ),
    );
    await user.click(check);
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("הדומיין מאומת"),
    );
  });

  test("an answer about a domain saved over since is not shown", async () => {
    mocks.site = {
      ...(mocks.site as SiteRow),
      custom_domain: "old.acme.co.il",
    };
    mocks.invoke
      .mockResolvedValueOnce(pending("old.acme.co.il", "old.vercel-dns.com"))
      .mockRejectedValueOnce(new Error("החיבור ל-Vercel נכשל"));
    const user = userEvent.setup();
    panel();
    await user.click(await screen.findByRole("button", { name: "בדיקה" }));
    expect(
      await screen.findByRole("button", { name: "העתקת old.vercel-dns.com" }),
    ).toBeInTheDocument();
    const field = screen.getByLabelText("דומיין");
    await user.clear(field);
    await user.type(field, "new.acme.co.il");
    await user.click(screen.getByRole("button", { name: "שמירת דומיין" }));
    await waitFor(() =>
      expect(screen.getByLabelText("דומיין")).toHaveValue("new.acme.co.il"),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "העתקת old.vercel-dns.com" }),
      ).toBeNull(),
    );
  });
});
