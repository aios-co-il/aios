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

  it("never returns an inherited object member for a crafted code", () => {
    for (const code of ["__proto__", "constructor", "tostring"]) {
      expect(typeof connectErrorMessage(code)).toBe("string");
    }
    expect(connectErrorMessage("__proto__")).toContain("(__proto__)");
  });

  it("never shows text a crafted link put in the error", () => {
    expect(connectErrorMessage("Your account is suspended, call +1-555")).toBe(
      "החיבור ל-Google נכשל. נסו להתחבר שוב.",
    );
  });
});

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
