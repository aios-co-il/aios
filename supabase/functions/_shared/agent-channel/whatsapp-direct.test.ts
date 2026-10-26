import assert from "node:assert/strict";
import test from "node:test";
import {
  isOwnerSender,
  parseWhatsAppDirectCommand,
  replyTargetFrom,
  whatsAppReplyText,
} from "./whatsapp-direct-logic.ts";

test("parses Claude and Cursor prefixes in Hebrew and English", () => {
  assert.deepEqual(parseWhatsAppDirectCommand("קלוד תבדוק את הדופק"), {
    provider: "claude",
    content: "תבדוק את הדופק",
  });
  assert.deepEqual(parseWhatsAppDirectCommand("  Claude: fix the report"), {
    provider: "claude",
    content: "fix the report",
  });
  assert.deepEqual(parseWhatsAppDirectCommand("קרסר, תפתח PR"), {
    provider: "cursor",
    content: "תפתח PR",
  });
  assert.deepEqual(parseWhatsAppDirectCommand("cursor - run tests"), {
    provider: "cursor",
    content: "run tests",
  });
});

test("ignores Carmen messages, bare triggers and words that only start with the trigger", () => {
  assert.equal(parseWhatsAppDirectCommand("כרמן מה קורה"), null);
  assert.equal(parseWhatsAppDirectCommand("קלוד"), null);
  assert.equal(parseWhatsAppDirectCommand("claudette hello"), null);
  assert.equal(parseWhatsAppDirectCommand("מה עם קלוד?"), null);
});

test("own reply echo never re-triggers a channel", () => {
  assert.equal(
    parseWhatsAppDirectCommand(whatsAppReplyText("claude", "OK")),
    null,
  );
  assert.equal(
    parseWhatsAppDirectCommand(whatsAppReplyText("cursor", "קלוד done")),
    null,
  );
});

test("only the owner writing from their profile phone may open a direct channel", () => {
  assert.equal(
    isOwnerSender({
      senderPhone: "972501234567",
      ownerPhones: [null, "050-123-4567"],
      roles: ["owner"],
    }),
    true,
  );
  assert.equal(
    isOwnerSender({
      senderPhone: "972501234567",
      ownerPhones: [null, "050-123-4567"],
      roles: ["campaigner"],
    }),
    false,
  );
  assert.equal(
    isOwnerSender({
      senderPhone: "972509999999",
      ownerPhones: [null, "050-123-4567"],
      roles: ["owner"],
    }),
    false,
  );
  assert.equal(
    isOwnerSender({ senderPhone: "", ownerPhones: [""], roles: ["owner"] }),
    false,
  );
});

test("reads the WhatsApp reply target from session metadata", () => {
  const target = {
    integration_id: "int-1",
    phone_number: "972500000000",
    connection_user_id: "user-1",
  };
  assert.deepEqual(replyTargetFrom({ reply_whatsapp: target }), target);
});

test("no reply target for non-WhatsApp or malformed session metadata", () => {
  assert.equal(replyTargetFrom(null), null);
  assert.equal(replyTargetFrom({}), null);
  assert.equal(
    replyTargetFrom({
      reply_whatsapp: { integration_id: "int-1", phone_number: "972500000000" },
    }),
    null,
  );
  assert.equal(
    replyTargetFrom({
      reply_whatsapp: {
        integration_id: 7,
        phone_number: "972500000000",
        connection_user_id: "user-1",
      },
    }),
    null,
  );
});
