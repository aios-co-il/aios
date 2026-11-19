import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { createTestQueryHarness, withTestQuery } from "@/test/withTestQuery";
import { completeGoogleConnect } from "@/lib/googleConnect";
import { useGoogleConnectRedirect } from "./useGoogleConnectRedirect";

const CONNECT_URL =
  "/t/acme/integrations#google_connect=google-analytics-auth&code=c&state=s";

describe("useGoogleConnectRedirect", () => {
  beforeEach(() => {
    vi.mocked(completeGoogleConnect).mockResolvedValue(undefined);
  });

  afterEach(() => {
    window.history.replaceState(null, "", "/");
    vi.clearAllMocks();
  });

  it("completes the connect from the fragment and clears it", async () => {
    window.history.replaceState(null, "", CONNECT_URL);

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

  it("refreshes the integration status after the connect is saved", async () => {
    window.history.replaceState(null, "", CONNECT_URL);
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

  it("shows the error when the connect is refused, and still clears the fragment", async () => {
    vi.mocked(completeGoogleConnect).mockRejectedValue(
      new Error("This connect was started by another user."),
    );
    window.history.replaceState(null, "", CONNECT_URL);

    render(withTestQuery(<RedirectConsumer />));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(toast.success).not.toHaveBeenCalled();
    expect(window.location.hash).toBe("");
  });

  it("does nothing without a connect fragment", () => {
    window.history.replaceState(null, "", "/t/acme/integrations#tab=crm");

    render(withTestQuery(<RedirectConsumer />));

    expect(completeGoogleConnect).not.toHaveBeenCalled();
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
