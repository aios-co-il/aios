import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReplyMarkdown } from "./ReplyMarkdown";
import {
  JWT_PUBLISHABLE_KEY,
  OPAQUE_PUBLISHABLE_KEY,
  OUTSIDE_IMAGE,
  PROJECT_ORIGIN,
} from "./replyImageSource.test-fixture";

const SIGNED =
  "https://api.aios.co.il/storage/v1/object/sign/command-center-files/user-1/1764150000000-brief.png?token=abc";

/** The rendered reply's root element. */
function renderReply(markdown: string): HTMLElement {
  return render(<ReplyMarkdown>{markdown}</ReplyMarkdown>).container;
}

describe("ReplyMarkdown", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://api.aios.co.il");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", JWT_PUBLISHABLE_KEY);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  describe("images", () => {
    it("loads an image from the environment's own storage", () => {
      const reply = renderReply(`הנה הקריאייטיב ![מודעה](${SIGNED})`);

      const image = reply.querySelector("img");
      expect(image).toHaveAttribute("src", SIGNED);
      expect(image).toHaveAttribute("alt", "מודעה");
    });

    it("loads a generated picture from the project's own address behind the custom domain", () => {
      const generated = `${PROJECT_ORIGIN}/storage/v1/object/public/social-media/workshop-imports/tenant-1/item-1/a.jpg`;

      const reply = renderReply(`![קריאייטיב](${generated})`);

      expect(reply.querySelector("img")).toHaveAttribute("src", generated);
    });

    it("loads an image from the app's own origin", () => {
      const reply = renderReply("![לוגו](/assets/logo.png)");

      expect(reply.querySelector("img")).toHaveAttribute(
        "src",
        "/assets/logo.png",
      );
    });

    it("shows an outside image as its description and a link with the address visible", () => {
      const reply = renderReply(`![דוח](${OUTSIDE_IMAGE})`);

      expect(reply.querySelector("img")).toBeNull();
      const link = reply.querySelector("a");
      expect(link).toHaveAttribute("href", OUTSIDE_IMAGE);
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
      expect(link).toHaveTextContent(OUTSIDE_IMAGE);
      expect(reply).toHaveTextContent(`דוח: ${OUTSIDE_IMAGE}`);
    });

    it("shows an outside image by reference the same way", () => {
      const reply = renderReply(`![דוח][pixel]\n\n[pixel]: ${OUTSIDE_IMAGE}`);

      expect(reply.querySelector("img")).toBeNull();
      expect(reply.querySelector("a")).toHaveAttribute("href", OUTSIDE_IMAGE);
    });

    it("keeps one link when an outside image sits inside a link", () => {
      const reply = renderReply(
        `[![תג](${OUTSIDE_IMAGE})](https://example.com/page)`,
      );

      expect(reply.querySelector("img")).toBeNull();
      const links = reply.querySelectorAll("a");
      expect(links).toHaveLength(1);
      expect(links[0]).toHaveAttribute("href", "https://example.com/page");
      expect(links[0]).toHaveTextContent(`תג: ${OUTSIDE_IMAGE}`);
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
      ["an image", `<img src="${OUTSIDE_IMAGE}">`, "img"],
      ["a video", `<video src="${OUTSIDE_IMAGE}" autoplay></video>`, "video"],
      [
        "an audio clip",
        `<audio src="${OUTSIDE_IMAGE}" autoplay></audio>`,
        "audio",
      ],
      ["a frame", `<iframe src="${OUTSIDE_IMAGE}"></iframe>`, "iframe"],
      [
        "a style sheet",
        `<style>p { background: url(${OUTSIDE_IMAGE}) }</style>`,
        "style",
      ],
      [
        "a linked resource",
        `<link rel="icon" href="${OUTSIDE_IMAGE}">`,
        "link",
      ],
    ])("stays text and never becomes %s", (_what, html, tag) => {
      const reply = renderReply(`שלום\n\n${html}`);

      expect(reply.querySelector(tag)).toBeNull();
      expect(reply).toHaveTextContent(OUTSIDE_IMAGE);
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

  describe("a build that cannot tell its project's own address", () => {
    it("says so once on the console instead of quietly showing links", async () => {
      vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", OPAQUE_PUBLISHABLE_KEY);
      vi.resetModules();
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);
      const fresh = await import("./ReplyMarkdown");
      const generated = `${PROJECT_ORIGIN}/storage/v1/object/public/social-media/a.jpg`;

      const { container } = render(
        <fresh.ReplyMarkdown>{`![א](${generated}) ![ב](${generated})`}</fresh.ReplyMarkdown>,
      );

      expect(container.querySelector("img")).toBeNull();
      expect(consoleError).toHaveBeenCalledTimes(1);
      expect(consoleError).toHaveBeenCalledWith(
        expect.stringContaining("VITE_SUPABASE_PUBLISHABLE_KEY"),
      );
    });

    it("stays quiet when the key names the project", async () => {
      vi.resetModules();
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);
      const fresh = await import("./ReplyMarkdown");

      render(
        <fresh.ReplyMarkdown>{`![א](${OUTSIDE_IMAGE})`}</fresh.ReplyMarkdown>,
      );

      expect(consoleError).not.toHaveBeenCalled();
    });
  });
});
