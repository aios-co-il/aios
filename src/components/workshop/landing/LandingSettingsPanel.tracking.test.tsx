import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { createTestQueryHarness, withTestQuery } from "@/test/withTestQuery";
import { LandingSettingsPanel } from "./LandingSettingsPanel";

/** The client's site as the settings read selects it. */
interface SiteRow {
  subdomain: string;
  gtm_id: string | null;
  ga4_id: string | null;
  meta_pixel_id: string | null;
}

/** The project's page with its site, as the settings read selects it. */
interface PageRow {
  slug: string;
  lead_to_crm: boolean;
  lead_to_webhook: boolean;
  landing_sites: SiteRow;
}

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  page: null as PageRow | null,
  site: null as SiteRow | null,
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

describe("LandingSettingsPanel tracking", () => {
  beforeEach(() => {
    mocks.rpc.mockReset();
    mocks.rpc.mockResolvedValue({ error: null });
    mocks.site = null;
    mocks.page = {
      slug: "home",
      lead_to_crm: true,
      lead_to_webhook: false,
      landing_sites: {
        subdomain: "acme",
        gtm_id: "GTM-NVKZTXH3",
        ga4_id: null,
        meta_pixel_id: null,
      },
    };
  });

  test("shows the stored ids and saves them for the site", async () => {
    const user = userEvent.setup();
    panel();
    expect(await screen.findByLabelText("Google Tag Manager")).toHaveValue(
      "GTM-NVKZTXH3",
    );
    await user.type(screen.getByLabelText("Google Analytics 4"), "g-abc1234");
    await user.click(screen.getByRole("button", { name: "שמירת קודי מעקב" }));
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledOnce());
    expect(mocks.rpc).toHaveBeenCalledWith("landing_site_save_tracking", {
      p_item_id: "p1",
      p_gtm_id: "GTM-NVKZTXH3",
      p_ga4_id: "G-ABC1234",
      p_meta_pixel_id: "",
    });
  });

  test("an unsaved id typed in one project does not follow to the next", async () => {
    const user = userEvent.setup();
    const { queryClient, wrapper: Provider } = createTestQueryHarness();
    // Keep a closed project's settings cached, as the app does between projects.
    queryClient.setDefaultOptions({
      queries: { retry: false, gcTime: Infinity },
    });
    /** The panel of one project, inside one shared cache. */
    function open(itemId: string) {
      return (
        <Provider>
          <LandingSettingsPanel tenantId="t1" itemId={itemId} clientId="c1" />
        </Provider>
      );
    }
    // Both projects are in the cache before the switch, as after browsing between them.
    const { rerender } = render(open("p2"));
    await screen.findByLabelText("Google Analytics 4");
    rerender(open("p1"));
    await user.type(
      await screen.findByLabelText("Google Analytics 4"),
      "G-ABC1234",
    );
    rerender(open("p2"));
    await waitFor(() =>
      expect(screen.getByLabelText("Google Analytics 4")).toHaveValue(""),
    );
  });

  test("a reopened project shows the ids another project saved since", async () => {
    const { queryClient, wrapper: Provider } = createTestQueryHarness();
    // The app's defaults: cached data is kept and not refetched on mount.
    queryClient.setDefaultOptions({
      queries: {
        retry: false,
        gcTime: Infinity,
        staleTime: Infinity,
        refetchOnMount: false,
      },
    });
    /** The panel of one project, inside one shared cache. */
    function open(itemId: string) {
      return (
        <Provider>
          <LandingSettingsPanel tenantId="t1" itemId={itemId} clientId="c1" />
        </Provider>
      );
    }
    const { rerender } = render(open("p1"));
    expect(await screen.findByLabelText("Google Tag Manager")).toHaveValue(
      "GTM-NVKZTXH3",
    );
    rerender(open("p2"));
    await screen.findByLabelText("Google Tag Manager");
    // Project p2 saved a new id for the shared site.
    if (mocks.page) {
      mocks.page = {
        ...mocks.page,
        landing_sites: { ...mocks.page.landing_sites, gtm_id: "GTM-NEW1234" },
      };
    }
    rerender(open("p1"));
    await waitFor(() =>
      expect(screen.getByLabelText("Google Tag Manager")).toHaveValue(
        "GTM-NEW1234",
      ),
    );
  });

  test("a tracking save keeps unsaved lead destination edits", async () => {
    // The save stores the new id, so the settings read after it differ.
    mocks.rpc.mockImplementation(async () => {
      mocks.page = {
        slug: "home",
        lead_to_crm: true,
        lead_to_webhook: false,
        landing_sites: {
          subdomain: "acme",
          gtm_id: "GTM-NVKZTXH3",
          ga4_id: "G-ABC1234",
          meta_pixel_id: null,
        },
      };
      return { error: null };
    });
    const user = userEvent.setup();
    panel();
    await user.click(await screen.findByRole("switch", { name: "לוובהוק" }));
    await user.type(
      screen.getByLabelText("כתובת הוובהוק"),
      "https://hooks.example/a",
    );
    await user.type(screen.getByLabelText("Google Analytics 4"), "G-ABC1234");
    await user.click(screen.getByRole("button", { name: "שמירת קודי מעקב" }));
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "שמירת קודי מעקב" }),
      ).toBeEnabled(),
    );
    expect(screen.getByLabelText("כתובת הוובהוק")).toHaveValue(
      "https://hooks.example/a",
    );
    expect(screen.getByRole("switch", { name: "לוובהוק" })).toBeChecked();
  });

  test("the ids cannot be edited while their save is on its way", async () => {
    let answer: ((value: { error: null }) => void) | undefined;
    mocks.rpc.mockReturnValue(
      new Promise((resolve) => {
        answer = resolve;
      }),
    );
    const user = userEvent.setup();
    panel();
    await user.type(
      await screen.findByLabelText("Google Analytics 4"),
      "G-ABC1234",
    );
    await user.click(screen.getByRole("button", { name: "שמירת קודי מעקב" }));
    await waitFor(() =>
      expect(screen.getByLabelText("Google Analytics 4")).toBeDisabled(),
    );
    answer?.({ error: null });
    await waitFor(() =>
      expect(screen.getByLabelText("Google Analytics 4")).toBeEnabled(),
    );
  });

  test("an id in the wrong format cannot be saved", async () => {
    const user = userEvent.setup();
    panel();
    await user.type(await screen.findByLabelText("Meta Pixel"), "123");
    expect(
      screen.getByRole("button", { name: "שמירת קודי מעקב" }),
    ).toBeDisabled();
    expect(screen.getByText(/מזהה Meta Pixel לא תקין/)).toBeInTheDocument();
  });

  test("a client without a site saves its address first", async () => {
    mocks.page = null;
    panel();
    expect(
      await screen.findByText(
        "אחרי שמירת כתובת האתר אפשר להוסיף לו קודי מעקב ודומיין.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Google Tag Manager")).toBeNull();
  });
});
