import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReplyMarkdown } from "./ReplyMarkdown";

const OUTSIDE = "https://collect.example/pixel.png?d=lead-phone-0501234567";
const SIGNED =
  "https://api.aios.co.il/storage/v1/object/sign/command-center-files/user-1/1764150000000-brief.png?token=abc";

/** The rendered reply's root element. */
function renderReply(markdown: string): HTMLElement {
  return render(<ReplyMarkdown>{markdown}</ReplyMarkdown>).container;
}

describe("ReplyMarkdown", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://api.aios.co.il");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("images", () => {
    it("loads an image from the environment's own storage", () => {
      const reply = renderReply(`הנה הקריאייטיב ![מודעה](${SIGNED})`);

      const image = reply.querySelector("img");
      expect(image).toHaveAttribute("src", SIGNED);
      expect(image).toHaveAttribute("alt", "מודעה");
    });

    it("loads an image from the app's own origin", () => {
      const reply = renderReply("![לוגו](/assets/logo.png)");

      expect(reply.querySelector("img")).toHaveAttribute(
        "src",
        "/assets/logo.png",
      );
    });

    it("shows an outside image as its description and a link with the address visible", () => {
      const reply = renderReply(`![דוח](${OUTSIDE})`);

      expect(reply.querySelector("img")).toBeNull();
      const link = reply.querySelector("a");
      expect(link).toHaveAttribute("href", OUTSIDE);
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
      expect(link).toHaveTextContent(OUTSIDE);
      expect(reply).toHaveTextContent(`דוח: ${OUTSIDE}`);
    });

    it("shows an outside image by reference the same way", () => {
      const reply = renderReply(`![דוח][pixel]\n\n[pixel]: ${OUTSIDE}`);

      expect(reply.querySelector("img")).toBeNull();
      expect(reply.querySelector("a")).toHaveAttribute("href", OUTSIDE);
    });

    it("keeps one link when an outside image sits inside a link", () => {
      const reply = renderReply(
        `[![תג](${OUTSIDE})](https://example.com/page)`,
      );

      expect(reply.querySelector("img")).toBeNull();
      const links = reply.querySelectorAll("a");
      expect(links).toHaveLength(1);
      expect(links[0]).toHaveAttribute("href", "https://example.com/page");
      expect(links[0]).toHaveTextContent(`תג: ${OUTSIDE}`);
    });

    it("shows only the description when Markdown drops the address", () => {
      const reply = renderReply("![תמונה](javascript:alert(1))");

      expect(reply.querySelector("img")).toBeNull();
      expect(reply.querySelector("a")).toBeNull();
      expect(reply).toHaveTextContent("תמונה");
    });
  });

  describe("raw HTML in a reply", () => {
    it.each([
      ["an image", `<img src="${OUTSIDE}">`, "img"],
      ["a video", `<video src="${OUTSIDE}" autoplay></video>`, "video"],
      ["an audio clip", `<audio src="${OUTSIDE}" autoplay></audio>`, "audio"],
      ["a frame", `<iframe src="${OUTSIDE}"></iframe>`, "iframe"],
      [
        "a style sheet",
        `<style>p { background: url(${OUTSIDE}) }</style>`,
        "style",
      ],
      ["a linked resource", `<link rel="icon" href="${OUTSIDE}">`, "link"],
    ])("stays text and never becomes %s", (_what, html, tag) => {
      const reply = renderReply(`שלום\n\n${html}`);

      expect(reply.querySelector(tag)).toBeNull();
      expect(reply).toHaveTextContent(OUTSIDE);
    });
  });

  describe("links and tables", () => {
    it("opens a link in a new tab", () => {
      const reply = renderReply("[הדוח](https://example.com/report)");

      const link = reply.querySelector("a");
      expect(link).toHaveAttribute("href", "https://example.com/report");
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    });

    it("renders a table", () => {
      const reply = renderReply("| לקוח | סטטוס |\n|---|---|\n| א | קריטי |");

      expect(reply.querySelector("table")).toHaveTextContent("קריטי");
    });
  });
});
