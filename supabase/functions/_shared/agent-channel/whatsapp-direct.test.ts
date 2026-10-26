import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import {
  isOwnerSender,
  parseWhatsAppDirectCommand,
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
