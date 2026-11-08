import { assertEquals } from "jsr:@std/assert@1";
import { pickMediaFromRaw } from "./raw-media.ts";

Deno.test("pickMediaFromRaw reads top-level media fields", () => {
  assertEquals(
    pickMediaFromRaw({
      mediaUrl: "https://x/a.jpg",
      mimeType: "image/jpeg",
      caption: "hi",
    }),
    { url: "https://x/a.jpg", mime: "image/jpeg", caption: "hi" },
  );
});

Deno.test("pickMediaFromRaw reads nested image/video messages", () => {
  assertEquals(
    pickMediaFromRaw({
      message: {
        videoMessage: { url: "https://x/v.mp4", mimetype: "video/mp4" },
        caption: "clip",
      },
    }),
    { url: "https://x/v.mp4", mime: "video/mp4", caption: "clip" },
  );
});

Deno.test("pickMediaFromRaw keeps the first truthy candidate", () => {
  assertEquals(
    pickMediaFromRaw({
      media_url: "",
      url: { nested: true },
      file_url: "https://x/f.png",
      text: 5,
    }),
    { url: "https://x/f.png", mime: undefined, caption: "5" },
  );
});

Deno.test("pickMediaFromRaw reads non-objects as empty", () => {
  const empty = { url: undefined, mime: undefined, caption: undefined };
  for (const raw of [null, undefined, "x", 3, ["https://x"]]) {
    assertEquals(pickMediaFromRaw(raw), empty);
  }
});
