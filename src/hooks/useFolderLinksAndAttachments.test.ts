import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useFolderLinksAndAttachments } from "./useFolderLinksAndAttachments";

describe("useFolderLinksAndAttachments", () => {
  it("parses JSON string and array columns", () => {
    const { result } = renderHook(() =>
      useFolderLinksAndAttachments({
        folder_links: JSON.stringify([{ name: "Drive", url: "https://d" }]),
        attachments: [{ name: "a.pdf", type: "application/pdf", size: 3 }],
      }),
    );
    expect(result.current.folderLinks).toEqual([
      { name: "Drive", url: "https://d" },
    ]);
    expect(result.current.attachments[0]).toMatchObject({
      name: "a.pdf",
      type: "application/pdf",
      size: 3,
    });
    expect(result.current.filesCount).toBe(2);
  });

  it("falls back to the legacy folder_link and ignores malformed entries", () => {
    const { result } = renderHook(() =>
      useFolderLinksAndAttachments({
        folder_links: "{not json",
        folder_link: "https://legacy",
        attachments: [null, "x", { name: 1 }],
      }),
    );
    expect(result.current.folderLinks).toEqual([
      { name: "קישור", url: "https://legacy" },
    ]);
    expect(result.current.attachments).toHaveLength(1);
    expect(result.current.attachments[0]).toMatchObject({ name: "", type: "" });
  });
});
