import { assertEquals } from "jsr:@std/assert@1";
import { addressShape } from "./address.ts";

const GROUP = "99999999-9999-4999-8999-999999999999";

/** The shape of a WhatsApp address the sender sent to a phone. */
const whatsapp = (address: string) =>
  addressShape({ channel: "whatsapp", address, groupId: null });

Deno.test("addressShape reads WhatsApp chat ids", async (t) => {
  await t.step("a group chat id stays as is", () => {
    assertEquals(whatsapp(" 120363416882903532@g.us "), {
      shape: "group",
      address: "120363416882903532@g.us",
    });
  });

  await t.step("a named group row's chat id is a group, any suffix", () => {
    assertEquals(
      addressShape({
        channel: "whatsapp",
        address: "120363416882903532",
        groupId: GROUP,
      }),
      { shape: "group", address: "120363416882903532" },
    );
  });

  await t.step("a one-to-one chat id becomes its phone", () => {
    assertEquals(whatsapp("972501234567@c.us"), {
      shape: "phone",
      address: "972501234567",
    });
    assertEquals(whatsapp("972501234567@s.whatsapp.net"), {
      shape: "phone",
      address: "972501234567",
    });
  });

  await t.step("a bare phone, as the Manus and Meta senders pass it", () => {
    assertEquals(whatsapp("050-1234567"), {
      shape: "phone",
      address: "050-1234567",
    });
  });

  await t.step("nothing can match a lid, a broadcast or a short number", () => {
    for (const address of ["123456789012@lid", "status@broadcast", "12345"]) {
      assertEquals(whatsapp(address), { shape: "unusable" });
    }
    assertEquals(
      addressShape({ channel: "whatsapp", address: " ", groupId: GROUP }),
      { shape: "unusable" },
    );
  });
});

Deno.test("addressShape reads emails and Telegram chats", async (t) => {
  await t.step("an email is compared lower-cased", () => {
    assertEquals(
      addressShape({
        channel: "email",
        address: " Owner@Client.CO.IL ",
        groupId: null,
      }),
      { shape: "email", address: "owner@client.co.il" },
    );
    assertEquals(
      addressShape({
        channel: "email",
        address: "not-an-email",
        groupId: null,
      }),
      { shape: "unusable" },
    );
  });

  await t.step("a Telegram chat id is a number, negative for groups", () => {
    assertEquals(
      addressShape({
        channel: "telegram",
        address: "-100123456",
        groupId: null,
      }),
      { shape: "telegram", address: "-100123456" },
    );
    assertEquals(
      addressShape({ channel: "telegram", address: "@handle", groupId: null }),
      { shape: "unusable" },
    );
  });
});
