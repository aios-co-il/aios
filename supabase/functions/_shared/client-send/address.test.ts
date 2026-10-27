import { assertEquals } from "jsr:@std/assert@1";
import { addressShape } from "./address.ts";

Deno.test("addressShape reads WhatsApp chat ids", async (t) => {
  await t.step("a group chat id stays as is", () => {
    assertEquals(addressShape("whatsapp", " 120363416882903532@g.us "), {
      shape: "group",
      address: "120363416882903532@g.us",
    });
  });

  await t.step("a one-to-one chat id becomes its phone", () => {
    assertEquals(addressShape("whatsapp", "972501234567@c.us"), {
      shape: "phone",
      address: "972501234567",
    });
    assertEquals(addressShape("whatsapp", "972501234567@s.whatsapp.net"), {
      shape: "phone",
      address: "972501234567",
    });
  });

  await t.step("a bare phone, as the Manus and Meta senders pass it", () => {
    assertEquals(addressShape("whatsapp", "050-1234567"), {
      shape: "phone",
      address: "050-1234567",
    });
  });

  await t.step("nothing can match a lid, a broadcast or a short number", () => {
    for (const address of ["123456789012@lid", "status@broadcast", "12345"]) {
      assertEquals(addressShape("whatsapp", address), { shape: "unusable" });
    }
  });
});

Deno.test("addressShape reads emails and Telegram chats", async (t) => {
  await t.step("an email is compared lower-cased", () => {
    assertEquals(addressShape("email", " Owner@Client.CO.IL "), {
      shape: "email",
      address: "owner@client.co.il",
    });
    assertEquals(addressShape("email", "not-an-email"), { shape: "unusable" });
  });

  await t.step("a Telegram chat id is a number, negative for groups", () => {
    assertEquals(addressShape("telegram", "-100123456"), {
      shape: "telegram",
      address: "-100123456",
    });
    assertEquals(addressShape("telegram", "@handle"), { shape: "unusable" });
  });
});
