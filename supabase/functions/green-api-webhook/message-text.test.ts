import assert from "node:assert/strict";
import { test } from "node:test";
import { extractMessageText } from "./message-text.ts";

test("text messages read the nested or flat text", () => {
  assert.equal(
    extractMessageText(
      { textMessageData: { textMessage: "hi" } },
      "textMessage",
    ),
    "hi",
  );
  assert.equal(
    extractMessageText({ textMessage: "flat" }, "textMessage"),
    "flat",
  );
  assert.equal(
    extractMessageText(
      { extendedTextMessage: { text: "link" } },
      "extendedTextMessage",
    ),
    "link",
  );
  assert.equal(extractMessageText(null, "textMessage"), "");
});

test("media messages use the caption or a placeholder", () => {
  assert.equal(
    extractMessageText({ fileMessageData: { caption: "cap" } }, "imageMessage"),
    "cap",
  );
  assert.equal(extractMessageText({}, "imageMessage"), "[תמונה]");
  assert.equal(extractMessageText({ caption: "v" }, "videoMessage"), "v");
  assert.equal(
    extractMessageText(
      { fileMessageData: { fileName: "a.pdf" } },
      "documentMessage",
    ),
    "[מסמך: a.pdf]",
  );
  assert.equal(extractMessageText({}, "documentMessage"), "[מסמך: קובץ]");
});

test("contact messages include the vCard phone", () => {
  assert.equal(
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
  assert.equal(extractMessageText({}, "contactMessage"), "[איש קשר]");
  assert.equal(
    extractMessageText(
      { contactsArrayMessageData: { contacts: [{ displayName: "A" }, {}] } },
      "contactsArrayMessage",
    ),
    "[אנשי קשר: A, איש קשר]",
  );
});

test("other types fall back to labelled placeholders", () => {
  assert.equal(
    extractMessageText(
      { locationMessageData: { nameLocation: "TLV" } },
      "locationMessage",
    ),
    "[מיקום: TLV]",
  );
  assert.equal(
    extractMessageText({ listMessage: { title: "T" } }, "listMessage"),
    "T",
  );
  assert.equal(
    extractMessageText(
      { reactionMessage: { reaction: "❤" } },
      "reactionMessage",
    ),
    "[תגובה: ❤]",
  );
  assert.equal(extractMessageText({}, "pollMessage"), "[pollMessage]");
});
