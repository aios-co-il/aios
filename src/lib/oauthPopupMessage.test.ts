import { describe, expect, it } from "vitest";
import { isOAuthPopupMessage } from "./oauthPopupMessage";

const SUPABASE_URL = "https://project.supabase.co";

function message(origin: string, type: string) {
  return new MessageEvent("message", { origin, data: { type } });
}

describe("isOAuthPopupMessage", () => {
  it("accepts the popup's message from the Supabase origin", () => {
    expect(
      isOAuthPopupMessage(
        message(SUPABASE_URL, "calendar_connected"),
        "calendar_connected",
        SUPABASE_URL,
      ),
    ).toBe(true);
  });

  it("ignores the same message from another origin", () => {
    expect(
      isOAuthPopupMessage(
        message("https://evil.example", "gmail_connected"),
        "gmail_connected",
        SUPABASE_URL,
      ),
    ).toBe(false);
  });

  it("ignores another message type", () => {
    expect(
      isOAuthPopupMessage(
        message(SUPABASE_URL, "gmail_connected"),
        "calendar_connected",
        SUPABASE_URL,
      ),
    ).toBe(false);
  });

  it("ignores every message when the Supabase URL is missing", () => {
    expect(
      isOAuthPopupMessage(
        message(SUPABASE_URL, "calendar_connected"),
        "calendar_connected",
        "",
      ),
    ).toBe(false);
  });
});
