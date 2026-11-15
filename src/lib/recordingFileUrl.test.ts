import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  openableRecordingUrl,
  openRecordingFile,
  publicRecordingPath,
} from "./recordingFileUrl";

const createSignedUrl = vi.hoisted(() => vi.fn());

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { storage: { from: () => ({ createSignedUrl }) } },
}));

const PUBLIC =
  "https://x.supabase.co/storage/v1/object/public/recordings/summaries/t-1/client_c/1_summary.docx";
const SIGNED =
  "https://x.supabase.co/storage/v1/object/sign/recordings/summaries/t-1/a.docx?token=abc";

describe("publicRecordingPath", () => {
  it("returns the object path of a public recordings URL", () => {
    expect(publicRecordingPath(PUBLIC)).toBe(
      "summaries/t-1/client_c/1_summary.docx",
    );
  });

  it("decodes an encoded path", () => {
    expect(
      publicRecordingPath(
        "https://x.supabase.co/storage/v1/object/public/recordings/t-1/%D7%90.webm",
      ),
    ).toBe("t-1/א.webm");
  });

  it("ignores signed URLs and other buckets", () => {
    expect(publicRecordingPath(SIGNED)).toBeNull();
    expect(
      publicRecordingPath(
        "https://x.supabase.co/storage/v1/object/public/tenant-logos/a.png",
      ),
    ).toBeNull();
  });
});

describe("openableRecordingUrl", () => {
  beforeEach(() => {
    createSignedUrl.mockReset();
  });

  it("signs a stored public recordings URL", async () => {
    createSignedUrl.mockResolvedValue({
      data: { signedUrl: "https://signed" },
      error: null,
    });

    await expect(openableRecordingUrl(PUBLIC)).resolves.toBe("https://signed");
    expect(createSignedUrl).toHaveBeenCalledWith(
      "summaries/t-1/client_c/1_summary.docx",
      3600,
    );
  });

  it("returns any other URL unchanged", async () => {
    await expect(openableRecordingUrl(SIGNED)).resolves.toBe(SIGNED);
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it("throws when signing fails", async () => {
    createSignedUrl.mockResolvedValue({
      data: null,
      error: new Error("Object not found"),
    });

    await expect(openableRecordingUrl(PUBLIC)).rejects.toThrow(
      "Object not found",
    );
  });
});

describe("openRecordingFile", () => {
  const tab = { opener: {}, location: { href: "" }, close: vi.fn() };
  const open = vi.fn();

  beforeEach(() => {
    createSignedUrl.mockReset();
    tab.location.href = "";
    tab.close.mockReset();
    open.mockReset().mockReturnValue(tab);
    vi.stubGlobal("open", open);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("opens any other URL directly", async () => {
    await openRecordingFile(SIGNED);

    expect(open).toHaveBeenCalledWith(SIGNED, "_blank", "noopener,noreferrer");
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it("opens a tab at click time and sends it to a freshly signed URL", async () => {
    createSignedUrl.mockResolvedValue({
      data: { signedUrl: "https://signed" },
      error: null,
    });

    await openRecordingFile(PUBLIC);

    expect(open).toHaveBeenCalledWith("", "_blank");
    expect(tab.location.href).toBe("https://signed");
    expect(tab.opener).toBeNull();
  });

  it("closes the tab and throws when signing fails", async () => {
    createSignedUrl.mockResolvedValue({
      data: null,
      error: new Error("Object not found"),
    });

    await expect(openRecordingFile(PUBLIC)).rejects.toThrow("Object not found");
    expect(tab.close).toHaveBeenCalled();
  });
});
