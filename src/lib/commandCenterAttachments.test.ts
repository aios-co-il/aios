import { describe, expect, it, vi } from "vitest";
import {
  formatAttachmentsForPrompt,
  splitTurnAttachments,
} from "./commandCenterAttachments";

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

describe("splitTurnAttachments", () => {
  const shot = {
    name: "shot.png",
    url: "https://x/signed/shot.png?token=secret",
    type: "image" as const,
    size: 1200,
    path: "user-1/1-shot.png",
  };
  const pdf = {
    name: "a.pdf",
    url: "https://x/signed/a.pdf?token=secret",
    type: "file" as const,
    path: "user-1/2-a.pdf",
  };

  it("sends a picture as its storage path, with no link anywhere", () => {
    const turn = splitTurnAttachments([shot], " מה כתוב כאן? ", "📎");

    expect(turn.commandText).toBe("מה כתוב כאן?");
    expect(turn.pictures).toEqual([
      {
        name: "shot.png",
        path: "user-1/1-shot.png",
        type: "image",
        size: 1200,
      },
    ]);
    expect(JSON.stringify(turn)).not.toContain("https://");
  });

  it("uses the placeholder for a message that is pictures only", () => {
    const turn = splitTurnAttachments([shot], "", "📎 קבצים מצורפים");

    expect(turn.commandText).toBe("📎 קבצים מצורפים");
  });

  it("keeps other files as text with their link, as before", () => {
    const turn = splitTurnAttachments([shot, pdf], "בדוק", "📎");

    expect(turn.pictures.map((picture) => picture.name)).toEqual(["shot.png"]);
    expect(turn.commandText).toBe(formatAttachmentsForPrompt([pdf], "בדוק"));
    expect(turn.commandText).not.toContain("shot.png");
  });

  it("a picture without a stored path stays a text line", () => {
    const linked = {
      name: "old.png",
      url: "https://x/o.png",
      type: "image" as const,
    };
    const turn = splitTurnAttachments([linked], "", "📎");

    expect(turn.pictures).toEqual([]);
    expect(turn.commandText).toContain("https://x/o.png");
  });

  it("a message without attachments is its text", () => {
    expect(splitTurnAttachments([], "שלום", "📎")).toEqual({
      commandText: "שלום",
      pictures: [],
    });
  });
});
