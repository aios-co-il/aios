import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestQueryHarness, withTestQuery } from "@/test/withTestQuery";
import { TrustedSites } from "./TrustedSites";
import { listTrustedSites, revokeTrustedSite } from "./trustedSitesApi";

vi.mock("./trustedSitesApi", () => ({
  listTrustedSites: vi.fn(),
  revokeTrustedSite: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

const SHOP = { id: "trust-1", origin: "https://shop.example:8443" };

describe("TrustedSites", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listTrustedSites).mockResolvedValue([SHOP]);
    vi.mocked(revokeTrustedSite).mockResolvedValue();
  });

  it("names each site trusted for the conversation, with its port", async () => {
    render(
      withTestQuery(
        <TrustedSites conversationId="c1" active waiting={false} />,
      ),
    );

    expect(await screen.findByText("shop.example:8443")).toBeInTheDocument();
    expect(listTrustedSites).toHaveBeenCalledWith("c1");
  });

  it("ends a trust from its button and reads the list again", async () => {
    const user = userEvent.setup();
    render(
      withTestQuery(
        <TrustedSites conversationId="c1" active waiting={false} />,
      ),
    );

    const revoke = await screen.findByRole("button", {
      name: "להפסיק לסמוך על shop.example:8443",
    });
    vi.mocked(listTrustedSites).mockResolvedValue([]);
    await user.click(revoke);

    await waitFor(() => expect(revokeTrustedSite).toHaveBeenCalled());
    expect(vi.mocked(revokeTrustedSite).mock.calls[0][0]).toBe("trust-1");
    await waitFor(() =>
      expect(screen.queryByText("shop.example:8443")).not.toBeInTheDocument(),
    );
  });

  it("reads nothing away from the panel or without a conversation", async () => {
    const { container } = render(
      withTestQuery(
        <>
          <TrustedSites conversationId="c1" active={false} waiting={false} />
          <TrustedSites conversationId={null} active waiting={false} />
        </>,
      ),
    );

    await Promise.resolve();
    expect(listTrustedSites).not.toHaveBeenCalled();
    expect(container).toBeEmptyDOMElement();
  });

  it("reads the list again when a browser step stops waiting", async () => {
    vi.mocked(listTrustedSites).mockResolvedValue([]);
    const { wrapper: Provider } = createTestQueryHarness();
    /** The strip in one shared cache, for a step that waits or not. */
    function ui(waiting: boolean) {
      return (
        <Provider>
          <TrustedSites conversationId="c1" active waiting={waiting} />
        </Provider>
      );
    }

    const { rerender } = render(ui(true));
    await waitFor(() => expect(listTrustedSites).toHaveBeenCalledTimes(1));

    vi.mocked(listTrustedSites).mockResolvedValue([SHOP]);
    rerender(ui(false));

    expect(await screen.findByText("shop.example:8443")).toBeInTheDocument();
  });
});
