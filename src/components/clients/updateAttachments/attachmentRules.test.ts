import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import {
  ATTACHMENT_EXTENSION_BY_TYPE,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS_PER_UPDATE,
  resolveAttachmentType,
  validateAttachmentFiles,
} from "./attachmentRules";

const MIGRATION = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20261126190000_client_update_attachments.sql",
  ),
  "utf8",
);

/** A File of `size` bytes without allocating them. */
function fakeFile(name: string, type: string, size = 1000): File {
  const file = new File(["x"], name, { type });
  Object.defineProperty(file, "size", { value: size });
  return file;
}

describe("attachment rules match the bucket", () => {
  test("the accepted types are the bucket's allowed_mime_types", () => {
    const bucketTypes = [
      ...(MIGRATION.match(/ARRAY\[([\s\S]*?)\]/)?.[1] ?? "").matchAll(
        /'([^']+)'/g,
      ),
    ].map((match) => match[1]);

    expect(Object.keys(ATTACHMENT_EXTENSION_BY_TYPE).sort()).toEqual(
      bucketTypes.sort(),
    );
  });

  test("the size limit and per-entry cap are the migration's", () => {
    expect(MIGRATION).toContain(`  ${MAX_ATTACHMENT_BYTES},\n`);
    expect(MIGRATION).toContain(`) >= ${MAX_ATTACHMENTS_PER_UPDATE} THEN`);
  });
});

describe("resolveAttachmentType", () => {
  test("keeps an accepted browser type and refuses others", () => {
    expect(resolveAttachmentType(fakeFile("a.pdf", "application/pdf"))).toBe(
      "application/pdf",
    );
    expect(
      resolveAttachmentType(fakeFile("a.svg", "image/svg+xml")),
    ).toBeNull();
    expect(resolveAttachmentType(fakeFile("a.html", "text/html"))).toBeNull();
  });

  test("a disguised file is judged by its declared type, not its name", () => {
    expect(
      resolveAttachmentType(
        fakeFile("invoice.pdf", "application/x-msdownload"),
      ),
    ).toBeNull();
  });

  test("an untyped file falls back to its extension", () => {
    expect(resolveAttachmentType(fakeFile("IMG_1.HEIC", ""))).toBe(
      "image/heic",
    );
    expect(resolveAttachmentType(fakeFile("photo.jpeg", ""))).toBe(
      "image/jpeg",
    );
    expect(resolveAttachmentType(fakeFile("run.exe", ""))).toBeNull();
  });
});

describe("validateAttachmentFiles", () => {
  test("refuses an unsupported, empty or too-large file in Hebrew", () => {
    const { accepted, errors } = validateAttachmentFiles(
      [
        fakeFile("ok.png", "image/png"),
        fakeFile("x.svg", "image/svg+xml"),
        fakeFile("empty.pdf", "application/pdf", 0),
        fakeFile("big.pdf", "application/pdf", MAX_ATTACHMENT_BYTES + 1),
      ],
      0,
    );

    expect(accepted.map((file) => file.name)).toEqual(["ok.png"]);
    expect(errors).toEqual([
      'לא ניתן לצרף את "x.svg": אפשר לצרף תמונות, PDF, קובצי Word, Excel ו-PowerPoint, טקסט ו-CSV',
      'הקובץ "empty.pdf" ריק',
      'הקובץ "big.pdf" גדול מדי: עד 20MB לקובץ',
    ]);
  });

  test("stops at the per-entry cap, counting files already picked", () => {
    const { accepted, errors } = validateAttachmentFiles(
      [fakeFile("a.png", "image/png"), fakeFile("b.png", "image/png")],
      MAX_ATTACHMENTS_PER_UPDATE - 1,
    );

    expect(accepted.map((file) => file.name)).toEqual(["a.png"]);
    expect(errors).toEqual(["אפשר לצרף עד 10 קבצים לעדכון אחד"]);
  });
});
