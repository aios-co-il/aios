import { describe, expect, it, vi } from "vitest";
import {
  carmenTurn,
  formatAttachmentsForPrompt,
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

describe("carmenTurn", () => {
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

  it("sends a picture by its storage path, with no link in that entry", () => {
    const turn = carmenTurn([shot], " מה כתוב כאן? ");

    expect(turn.pictures).toEqual([
      {
        name: "shot.png",
        path: "user-1/1-shot.png",
        type: "image",
        size: 1200,
      },
    ]);
    expect(JSON.stringify(turn.pictures)).not.toContain("https://");
  });

  it("keeps the text Carmen was always sent, every attachment a line", () => {
    const turn = carmenTurn([shot, pdf], " בדוק ");

    expect(turn.commandText).toBe(
      formatAttachmentsForPrompt([shot, pdf], "בדוק"),
    );
  });

  // The workshop takes the look to follow from this line: `referenceThisTurn` reads exactly
  // this shape (supabase/functions/_shared/workshop/brief-reading.test.ts), and Carmen's
  // tools that save or rework a picture take its address from it.
  it("an attached picture keeps its line and link for the workshop", () => {
    const turn = carmenTurn([shot], "סרטון בסגנון הזה");

    expect(turn.commandText).toBe(
      `סרטון בסגנון הזה\n\n📎 קבצים מצורפים (1):\n- תמונה: shot.png → ${shot.url}`,
    );
  });

  it("only pictures that were stored go by path", () => {
    const linked = {
      name: "old.png",
      url: "https://x/o.png",
      type: "image" as const,
    };
    const turn = carmenTurn([linked, pdf], "");

    expect(turn.pictures).toEqual([]);
    expect(turn.commandText).toContain("https://x/o.png");
  });

  it("a message without attachments is its text", () => {
    expect(carmenTurn([], " שלום ")).toEqual({
      commandText: "שלום",
      pictures: [],
    });
  });
});
