import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { createTestQueryHarness, withTestQuery } from "@/test/withTestQuery";
import { completeGoogleConnect } from "@/lib/googleConnect";
import { stashFragmentConnect } from "@/lib/googleConnectFragment";
import { useGoogleConnectRedirect } from "./useGoogleConnectRedirect";

const CONNECT_URL =
  "/t/acme/integrations#google_connect=google-analytics-auth&code=c&state=s";

describe("useGoogleConnectRedirect", () => {
  beforeEach(() => {
    vi.mocked(completeGoogleConnect).mockResolvedValue(undefined);
  });

  afterEach(() => {
    window.history.replaceState(null, "", "/");
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  it("completes the connect from the fragment and clears it", async () => {
    window.history.replaceState(null, "", CONNECT_URL);
    stashFragmentConnect();

    render(withTestQuery(<RedirectConsumer />));

    await waitFor(() =>
      expect(completeGoogleConnect).toHaveBeenCalledWith(
        { provider: "google-analytics-auth", code: "c", state: "s" },
        expect.anything(),
      ),
    );
    expect(window.location.hash).toBe("");
    expect(window.location.pathname).toBe("/t/acme/integrations");
  });

  it("completes the connect after a sign-in redirect dropped the fragment", async () => {
    window.history.replaceState(null, "", CONNECT_URL);
    stashFragmentConnect();
    window.history.replaceState(null, "", "/t/acme/home");

    render(withTestQuery(<RedirectConsumer />));

    await waitFor(() => expect(completeGoogleConnect).toHaveBeenCalled());
  });

  it("refreshes the integration status after the connect is saved", async () => {
    window.history.replaceState(null, "", CONNECT_URL);
    stashFragmentConnect();
    const { queryClient, wrapper: Provider } = createTestQueryHarness();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    render(
      <Provider>
        <RedirectConsumer />
      </Provider>,
    );

    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ["user-integrations"],
    });
  });

  it("shows the reason the connect was refused", async () => {
    vi.mocked(completeGoogleConnect).mockRejectedValue(
      new Error("This connect was started by another user."),
    );
    window.history.replaceState(null, "", CONNECT_URL);
    stashFragmentConnect();

    render(withTestQuery(<RedirectConsumer />));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringContaining("This connect was started by another user."),
      ),
    );
    expect(toast.success).not.toHaveBeenCalled();
    expect(window.location.hash).toBe("");
  });

  it("explains an expired connect link instead of completing", async () => {
    window.history.replaceState(
      null,
      "",
      "/t/app/integrations#google_connect=google-ads-auth&error=invalid_state",
    );
    stashFragmentConnect();

    render(withTestQuery(<RedirectConsumer />));

    expect(toast.error).toHaveBeenCalledWith(
      "קישור החיבור פג תוקף. נסו להתחבר שוב.",
    );
    expect(completeGoogleConnect).not.toHaveBeenCalled();
  });

  it("does nothing without a connect fragment", () => {
    window.history.replaceState(null, "", "/t/acme/integrations#tab=crm");
    stashFragmentConnect();

    render(withTestQuery(<RedirectConsumer />));

    expect(completeGoogleConnect).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
    expect(window.location.hash).toBe("#tab=crm");
  });
});

function RedirectConsumer() {
  useGoogleConnectRedirect();
  return null;
}

vi.mock("@/lib/googleConnect", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/googleConnect")>()),
  completeGoogleConnect: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
