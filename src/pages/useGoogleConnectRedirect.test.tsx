import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withTestQuery } from "@/test/withTestQuery";
import { completeGoogleConnect } from "@/lib/googleConnect";
import { useGoogleConnectRedirect } from "./useGoogleConnectRedirect";

describe("useGoogleConnectRedirect", () => {
  beforeEach(() => {
    vi.mocked(completeGoogleConnect).mockResolvedValue(undefined);
  });

  afterEach(() => {
    window.history.replaceState(null, "", "/");
    vi.clearAllMocks();
  });

  it("completes the connect from the fragment and clears it", async () => {
    window.history.replaceState(
      null,
      "",
      "/t/acme/integrations#google_connect=google-analytics-auth&code=c&state=s",
    );

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
