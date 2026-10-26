import { expect, test } from "vitest";
import {
  brandKitPrompt,
  deriveBrandBook,
  filesFromAttachments,
  getBrandKit,
  isGenerationAborted,
  isImageAttachment,
  mergeStyleReferences,
  sampleColorsFromImageData,
  throwIfGenerationAborted,
  websiteHref,
} from "./brandKit.ts";

test("getBrandKit reads logo, book, and style references from payload", () => {
  const kit = getBrandKit({
    logo_url: "https://example.com/logo.png",
    brand_book: {
      name: "Smartair",
      colors: ["#1d4ed8", "#111827"],
      notes: "n",
      source: "auto",
    },
    style_references: [{ url: "https://example.com/ref.jpg", name: "board" }],
  });
  expect(kit.logoUrl).toBe("https://example.com/logo.png");
  expect(kit.brandBook?.name).toBe("Smartair");
  expect(kit.styleReferences.length).toBe(1);
});

test("deriveBrandBook uses client + brief and never invents a logo rule-break", () => {
  const book = deriveBrandBook({
    clientName: "Smartair",
    website: "https://smartair.co.il",
    brief: "טיסות לרודוס במחיר הוגן",
    colors: ["#1d4ed8"],
  });
  expect(book.notes).toMatch(/Smartair/);
  expect(book.notes).toMatch(/לא ממציאים לוגו/);
  expect(book.colors[0]).toBe("#1d4ed8");
  expect(book.source).toBe("auto");
});

test("brandKitPrompt locks logo colors and attaches project style refs", () => {
  const prompt = brandKitPrompt({
    logoUrl: "https://example.com/logo.png",
    website: "https://smartair.co.il",
    brandBook: { colors: ["#111"], notes: "", source: "auto" },
    styleReferences: [{ url: "https://example.com/a.jpg" }],
  });
  expect(prompt).not.toMatch(/top-right pad/i);
  expect(prompt).toMatch(/STYLE REFERENCE/i);
  expect(prompt).toMatch(/palette dominance/i);
  expect(prompt).not.toMatch(/Do not attach, recall, or copy/i);
  expect(prompt).not.toMatch(/RANGE only/i);
  expect(prompt).toMatch(/ONLY these logo\/brand colors/i);
  expect(prompt).toMatch(/#111/);
  expect(prompt).toMatch(/smartair\.co\.il/);
  expect(prompt).toMatch(/will not overlay a watermark/i);
  expect(prompt).toMatch(/bottom-corner/i);
});

test("brandKitPrompt talent lock keeps the spokesman instead of forbidding faces", () => {
  const prompt = brandKitPrompt(
    {
      logoUrl: "https://example.com/logo.png",
      brandBook: { colors: ["#c00000"], notes: "", source: "auto" },
      styleReferences: [{ url: "https://example.com/person.jpg" }],
    },
    { talentLock: true },
  );
  expect(prompt).toMatch(/Keep that spokesman/i);
  expect(prompt).not.toMatch(/RANGE only/i);
  expect(prompt).not.toMatch(/Do not attach, recall, or copy/i);
});

test("client attachments become image style refs and ignore non-images", () => {
  const files = filesFromAttachments([
    { name: "look.jpg", path: "tenant/a.jpg", type: "image/jpeg" },
    { name: "brief.pdf", path: "tenant/b.pdf", type: "application/pdf" },
  ]);
  expect(files.length).toBe(2);
  expect(isImageAttachment(files[0])).toBe(true);
  expect(isImageAttachment(files[1])).toBe(false);
  expect(websiteHref("smartair.co.il")).toBe("https://smartair.co.il");
  const merged = mergeStyleReferences(
    [{ url: "https://example.com/a.jpg" }],
    [
      { url: "https://example.com/a.jpg" },
      { url: "https://example.com/b.jpg" },
    ],
  );
  expect(merged.length).toBe(2);
});

test("getBrandKit keeps an uploaded brand-book file", () => {
  const kit = getBrandKit({
    brand_book: {
      colors: ["#111"],
      notes: "n",
      source: "upload",
      fileUrl: "https://example.com/book.pdf",
      fileName: "book.pdf",
    },
  });
  expect(kit.brandBook?.fileName).toBe("book.pdf");
  expect(kit.brandBook?.source).toBe("upload");
});

test("isGenerationAborted recognizes abort signals and abort errors", () => {
  expect(isGenerationAborted(new Error("ABORTED"))).toBe(true);
  expect(isGenerationAborted(new DOMException("Aborted", "AbortError"))).toBe(
    true,
  );
  expect(isGenerationAborted(new Error("The user aborted a request."))).toBe(
    true,
  );
  expect(isGenerationAborted(new Error("network down"))).toBe(false);
});

test("throwIfGenerationAborted raises a recognizable abort error", () => {
  throwIfGenerationAborted(false);
  try {
    throwIfGenerationAborted(true);
    expect.fail("expected abort");
  } catch (error) {
    expect(isGenerationAborted(error)).toBe(true);
  }
});

test("sampleColorsFromImageData ignores near-white and transparent pixels", () => {
  const data = new Uint8ClampedArray([
    255, 255, 255, 255, 30, 80, 200, 255, 30, 80, 200, 10, 10, 10, 10, 255,
  ]);
  const colors = sampleColorsFromImageData(data);
  expect(colors.some((color) => color.startsWith("#"))).toBeTruthy();
  expect(!colors.includes("#ffffff")).toBeTruthy();
});
