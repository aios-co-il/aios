import { describe, expect, it, vi } from "vitest";
import { connectErrorMessage } from "./googleConnect";

describe("connectErrorMessage", () => {
  it("says in Hebrew why a connect returned without a code", () => {
    expect(connectErrorMessage("access_denied")).toBe("החיבור ל-Google בוטל.");
    expect(connectErrorMessage("invalid_state")).toBe(
      "קישור החיבור פג תוקף. נסו להתחבר שוב.",
    );
    expect(connectErrorMessage("server_error")).toContain("(server_error)");
  });
});

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
