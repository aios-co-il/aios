import { describe, expect, it } from "vitest";
import { attachmentsFromMetadata } from "./chatMessageAttachments";

describe("attachmentsFromMetadata", () => {
  it("returns undefined when metadata has no attachments array", () => {
    expect(attachmentsFromMetadata(undefined)).toBeUndefined();
    expect(attachmentsFromMetadata({})).toBeUndefined();
    expect(attachmentsFromMetadata({ attachments: "x" })).toBeUndefined();
    expect(attachmentsFromMetadata([])).toBeUndefined();
  });

  it("keeps well-formed attachments", () => {
    const image = {
      name: "a.png",
      url: "https://x/a.png",
      type: "image",
      size: 10,
      path: "t/a.png",
    };
    const file = { name: "b.pdf", url: "https://x/b.pdf", type: "file" };
    expect(attachmentsFromMetadata({ attachments: [image, file] })).toEqual([
      image,
      file,
    ]);
    expect(attachmentsFromMetadata({ attachments: [] })).toEqual([]);
  });

  it("skips malformed entries", () => {
    expect(
      attachmentsFromMetadata({
        attachments: [
          null,
          "x",
          { name: "a", url: "u", type: "video" },
          { name: "a", type: "file" },
        ],
      }),
    ).toEqual([]);
  });
});
