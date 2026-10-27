import { assertEquals } from "jsr:@std/assert@1";
import { manusTarget, toGatewayPhone } from "./target.ts";

const GROUP = "120363416882903532@g.us";

Deno.test("manusTarget", async (t) => {
  await t.step("a resolved group wins over the fallback phone", () => {
    assertEquals(
      manusTarget({
        groupId: "g1",
        groupChatId: GROUP,
        phoneNumber: "050-1234567",
        countryCode: "972",
      }),
      { to: GROUP, isGroup: true },
    );
  });

  await t.step("an unresolved group falls back to the phone", () => {
    assertEquals(
      manusTarget({
        groupId: "g1",
        groupChatId: null,
        phoneNumber: "0501234567",
        countryCode: null,
      }),
      { to: "972501234567", isGroup: false },
    );
  });

  await t.step("never a bare country code", () => {
    // broadcast-dispatch sends a group with no phone: that used to go to "972".
    assertEquals(
      manusTarget({
        groupId: "g1",
        groupChatId: null,
        phoneNumber: null,
        countryCode: "972",
      }),
      { error: "missing_group_chat_id" },
    );
    assertEquals(
      manusTarget({
        groupId: null,
        groupChatId: null,
        phoneNumber: "",
        countryCode: "972",
      }),
      { error: "missing_recipient" },
    );
    assertEquals(
      manusTarget({
        groupId: null,
        groupChatId: null,
        phoneNumber: "12",
        countryCode: "972",
      }),
      { error: "invalid_phone" },
    );
  });
});

Deno.test("toGatewayPhone", () => {
  assertEquals(toGatewayPhone("050-123-4567"), "972501234567");
  assertEquals(toGatewayPhone("+972 50 123 4567"), "972501234567");
  assertEquals(toGatewayPhone("00972501234567"), "972501234567");
  assertEquals(toGatewayPhone("2025550100", "1"), "12025550100");
});
