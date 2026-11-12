import { assertEquals } from "jsr:@std/assert@1";
import { greenUploadForm } from "./upload-form.ts";

Deno.test("the Hebrew file name goes in its own UTF-8 field", () => {
  const form = greenUploadForm({
    chatId: "972500000000@c.us",
    file: new Blob(["docx"]),
    fileName: "סיכום פגישה - בילבי.docx",
    caption: "סיכום",
  });
  assertEquals(form.get("fileName"), "סיכום פגישה - בילבי.docx");
  assertEquals(form.get("caption"), "סיכום");
  assertEquals(form.get("chatId"), "972500000000@c.us");
});

Deno.test("no caption field when there is no caption", () => {
  const form = greenUploadForm({
    chatId: "c",
    file: new Blob(["x"]),
    fileName: "a.pdf",
  });
  assertEquals(form.has("caption"), false);
});
