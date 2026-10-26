import { expect, test } from "vitest";
import {
  claimClipboardPaste,
  filesFromClipboardData,
  isClipboardImage,
  isClipboardTypingTarget,
  isFilePasteField,
  shouldUploadClipboardPaste,
} from "./clipboardFiles.ts";

test("filesFromClipboardData reads screenshot blobs from items", () => {
  const blob = new File([new Uint8Array([1, 2, 3])], "", { type: "image/png" });
  const files = filesFromClipboardData({
    items: [{ kind: "file", getAsFile: () => blob }],
  });
  expect(files.length).toBe(1);
  expect(files[0].type).toBe("image/png");
  expect(files[0].name).toBe("screenshot.png");
});

test("filesFromClipboardData collapses the same image from items and files", () => {
  const fromItem = new File([new Uint8Array([1, 2, 3])], "image.png", {
    type: "image/png",
    lastModified: 10,
  });
  const fromList = new File([new Uint8Array([1, 2, 3])], "screenshot.png", {
    type: "image/png",
    lastModified: 99,
  });
  const files = filesFromClipboardData({
    items: [{ kind: "file", type: "image/png", getAsFile: () => fromItem }],
    files: [fromList],
  });
  expect(files.length).toBe(1);
});

test("filesFromClipboardData keeps a real filename and de-dupes files list", () => {
  const file = new File([new Uint8Array([9])], "brief.pdf", {
    type: "application/pdf",
    lastModified: 1,
  });
  const files = filesFromClipboardData({
    items: [{ kind: "file", getAsFile: () => file }],
    files: [file],
  });
  expect(files.length).toBe(1);
  expect(files[0].name).toBe("brief.pdf");
});

test("claimClipboardPaste de-dupes the same tick", () => {
  expect(claimClipboardPaste()).toBe(true);
  expect(claimClipboardPaste()).toBe(false);
});

test("isClipboardTypingTarget skips inputs and textareas but not the files cube", () => {
  expect(isClipboardTypingTarget({ tagName: "INPUT" } as EventTarget)).toBe(
    true,
  );
  expect(isClipboardTypingTarget({ tagName: "TEXTAREA" } as EventTarget)).toBe(
    true,
  );
  expect(
    isClipboardTypingTarget({
      tagName: "DIV",
      isContentEditable: false,
    } as EventTarget),
  ).toBe(false);
  expect(isClipboardTypingTarget({ tagName: "BUTTON" } as EventTarget)).toBe(
    false,
  );
});

test("file paste field accepts Ctrl+V even though it is a textarea", () => {
  const field = {
    tagName: "TEXTAREA",
    dataset: { filePaste: "true" },
  } as unknown as EventTarget;
  expect(isFilePasteField(field)).toBe(true);
  expect(isClipboardTypingTarget(field)).toBe(false);
});

test("isClipboardImage treats screenshot names as images", () => {
  expect(
    isClipboardImage(
      new File([new Uint8Array([1])], "screenshot.png", { type: "" }),
    ),
  ).toBe(true);
  expect(
    isClipboardImage(
      new File([new Uint8Array([1])], "brief.pdf", { type: "application/pdf" }),
    ),
  ).toBe(false);
});

test("notes paste keeps text and pulls images into files", () => {
  const notes = { tagName: "TEXTAREA" } as EventTarget;
  const image = new File([new Uint8Array([1])], "screenshot.png", {
    type: "image/png",
  });
  const pdf = new File([new Uint8Array([1])], "brief.pdf", {
    type: "application/pdf",
  });
  expect(shouldUploadClipboardPaste(notes, [image])).toBe(true);
  expect(shouldUploadClipboardPaste(notes, [pdf])).toBe(false);
  expect(shouldUploadClipboardPaste(notes, [])).toBe(false);
});

test("filesFromClipboardData reads an image item that is not marked as a file", () => {
  const blob = new File([new Uint8Array([4])], "shot.png", {
    type: "image/png",
  });
  const files = filesFromClipboardData({
    items: [{ kind: "string", type: "image/png", getAsFile: () => blob }],
  });
  expect(files.length).toBe(1);
  expect(files[0].name).toBe("shot.png");
});
