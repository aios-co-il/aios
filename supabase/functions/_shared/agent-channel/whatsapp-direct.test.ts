import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import {
  isOwnerSender,
  parseWhatsAppDirectCommand,
  replyTargetFrom,
  whatsAppReplyText,
} from "./whatsapp-direct-logic.ts";

Deno.test("parses Claude and Cursor prefixes in Hebrew and English", () => {
  assertEquals(parseWhatsAppDirectCommand("קלוד תבדוק את הדופק"), {
    provider: "claude",
    content: "תבדוק את הדופק",
  });
  assertEquals(parseWhatsAppDirectCommand("  Claude: fix the report"), {
    provider: "claude",
    content: "fix the report",
  });
  assertEquals(parseWhatsAppDirectCommand("קרסר, תפתח PR"), {
    provider: "cursor",
    content: "תפתח PR",
  });
  assertEquals(parseWhatsAppDirectCommand("cursor - run tests"), {
    provider: "cursor",
    content: "run tests",
  });
});

Deno.test(
  "ignores Carmen messages, bare triggers and words that only start with the trigger",
  () => {
    assertStrictEquals(parseWhatsAppDirectCommand("כרמן מה קורה"), null);
    assertStrictEquals(parseWhatsAppDirectCommand("קלוד"), null);
    assertStrictEquals(parseWhatsAppDirectCommand("claudette hello"), null);
    assertStrictEquals(parseWhatsAppDirectCommand("מה עם קלוד?"), null);
  },
);

Deno.test("own reply echo never re-triggers a channel", () => {
  assertStrictEquals(
    parseWhatsAppDirectCommand(whatsAppReplyText("claude", "OK")),
    null,
  );
  assertStrictEquals(
    parseWhatsAppDirectCommand(whatsAppReplyText("cursor", "קלוד done")),
    null,
  );
});

Deno.test(
  "only the owner writing from their profile phone may open a direct channel",
  () => {
    assertStrictEquals(
      isOwnerSender({
        senderPhone: "972501234567",
        ownerPhones: [null, "050-123-4567"],
        roles: ["owner"],
      }),
      true,
    );
    assertStrictEquals(
      isOwnerSender({
        senderPhone: "972501234567",
        ownerPhones: [null, "050-123-4567"],
        roles: ["campaigner"],
      }),
      false,
    );
    assertStrictEquals(
      isOwnerSender({
        senderPhone: "972509999999",
        ownerPhones: [null, "050-123-4567"],
        roles: ["owner"],
      }),
      false,
    );
    assertStrictEquals(
      isOwnerSender({ senderPhone: "", ownerPhones: [""], roles: ["owner"] }),
      false,
    );
  },
);

Deno.test("reads the WhatsApp reply target from session metadata", () => {
  const target = {
    integration_id: "int-1",
    phone_number: "972500000000",
    connection_user_id: "user-1",
  };
  assertEquals(replyTargetFrom({ reply_whatsapp: target }), target);
});

Deno.test(
  "no reply target for non-WhatsApp or malformed session metadata",
  () => {
    assertStrictEquals(replyTargetFrom(null), null);
    assertStrictEquals(replyTargetFrom({}), null);
    assertStrictEquals(
      replyTargetFrom({
        reply_whatsapp: {
          integration_id: "int-1",
          phone_number: "972500000000",
        },
      }),
      null,
    );
    assertStrictEquals(
      replyTargetFrom({
        reply_whatsapp: {
          integration_id: "",
          phone_number: "972500000000",
          connection_user_id: "user-1",
        },
      }),
      null,
    );
    assertStrictEquals(
      replyTargetFrom({
        reply_whatsapp: {
          integration_id: "int-1",
          phone_number: true,
          connection_user_id: "user-1",
        },
      }),
      null,
    );
    assertStrictEquals(replyTargetFrom({ reply_whatsapp: "x" }), null);
  },
);

Deno.test("keeps a numeric reply target field as stored", () => {
  const target = {
    integration_id: "int-1",
    phone_number: 972500000000,
    connection_user_id: "user-1",
  };
  assertEquals(replyTargetFrom({ reply_whatsapp: target }), target);
});
