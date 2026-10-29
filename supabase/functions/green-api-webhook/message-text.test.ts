import { assertStrictEquals } from "jsr:@std/assert@1";
import { extractMessageText } from "./message-text.ts";

Deno.test("text messages read the nested or flat text", () => {
  assertStrictEquals(
    extractMessageText(
      { textMessageData: { textMessage: "hi" } },
      "textMessage",
    ),
    "hi",
  );
  assertStrictEquals(
    extractMessageText({ textMessage: "flat" }, "textMessage"),
    "flat",
  );
  assertStrictEquals(
    extractMessageText(
      { extendedTextMessage: { text: "link" } },
      "extendedTextMessage",
    ),
    "link",
  );
  assertStrictEquals(extractMessageText(null, "textMessage"), "");
});

Deno.test("media messages use the caption or a placeholder", () => {
  assertStrictEquals(
    extractMessageText({ fileMessageData: { caption: "cap" } }, "imageMessage"),
    "cap",
  );
  assertStrictEquals(extractMessageText({}, "imageMessage"), "[תמונה]");
  assertStrictEquals(extractMessageText({ caption: "v" }, "videoMessage"), "v");
  assertStrictEquals(
    extractMessageText(
      { fileMessageData: { fileName: "a.pdf" } },
      "documentMessage",
    ),
    "[מסמך: a.pdf]",
  );
  assertStrictEquals(extractMessageText({}, "documentMessage"), "[מסמך: קובץ]");
});

Deno.test("contact messages include the vCard phone", () => {
  assertStrictEquals(
    extractMessageText(
      {
        contactMessageData: {
          displayName: "Dana",
          vcard: "BEGIN:VCARD\nTEL;type=CELL:+972 50 123 4567\nEND:VCARD",
        },
      },
      "contactMessage",
    ),
    "[איש קשר: Dana - +972501234567]",
  );
  assertStrictEquals(extractMessageText({}, "contactMessage"), "[איש קשר]");
  assertStrictEquals(
    extractMessageText(
      { contactsArrayMessageData: { contacts: [{ displayName: "A" }, {}] } },
      "contactsArrayMessage",
    ),
    "[אנשי קשר: A, איש קשר]",
  );
});

Deno.test("other types fall back to labelled placeholders", () => {
  assertStrictEquals(
    extractMessageText(
      { locationMessageData: { nameLocation: "TLV" } },
      "locationMessage",
    ),
    "[מיקום: TLV]",
  );
  assertStrictEquals(
    extractMessageText({ listMessage: { title: "T" } }, "listMessage"),
    "T",
  );
  assertStrictEquals(
    extractMessageText(
      { reactionMessage: { reaction: "❤" } },
      "reactionMessage",
    ),
    "[תגובה: ❤]",
  );
  assertStrictEquals(extractMessageText({}, "pollMessage"), "[pollMessage]");
});
