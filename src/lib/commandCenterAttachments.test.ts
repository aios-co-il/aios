import { describe, expect, it, vi } from "vitest";
import { formatAttachmentsForPrompt } from "./commandCenterAttachments";

// These formatting tests do not need a hosted Supabase client.
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

describe("formatAttachmentsForPrompt", () => {
  it("includes user text and attachment URLs", () => {
    const text = formatAttachmentsForPrompt(
      [{ name: "shot.png", url: "https://x/s.png", type: "image" }],
      "בדוק את זה",
    );
    expect(text).toContain("בדוק את זה");
    expect(text).toContain("shot.png");
    expect(text).toContain("https://x/s.png");
  });

  it("works with attachments only", () => {
    const text = formatAttachmentsForPrompt([
      { name: "a.pdf", url: "https://x/a.pdf", type: "file" },
    ]);
    expect(text).toContain("📎 קבצים מצורפים");
    expect(text).toContain("קובץ");
  });
});
