import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { parseApprovalReply } from "./reply.ts";

Deno.test("parseApprovalReply", async (t) => {
  await t.step("parseApprovalReply reads codes and keeps plain phrases", () => {
    assertEquals(parseApprovalReply("כן 4821"), {
      approve: true,
      reject: false,
      code: "4821",
    });
    assertEquals(parseApprovalReply("מאשר, 4821!"), {
      approve: true,
      reject: false,
      code: "4821",
    });
    assertEquals(parseApprovalReply("כן קוד #4821"), {
      approve: true,
      reject: false,
      code: "4821",
    });
    assertEquals(parseApprovalReply("לא 4821"), {
      approve: false,
      reject: true,
      code: "4821",
    });
    assertEquals(parseApprovalReply("כן"), {
      approve: true,
      reject: false,
      code: null,
    });
    assertStrictEquals(parseApprovalReply("4821").approve, false);
    assertStrictEquals(
      parseApprovalReply("כן 4821 וגם תשלחי דוח").approve,
      false,
    );
  });

  await t.step("codes are 4 or 6 digits; 5 digits is not a code", () => {
    assertStrictEquals(parseApprovalReply("כן 123456").code, "123456");
    assertStrictEquals(parseApprovalReply("לא 123456").reject, true);
    assertStrictEquals(parseApprovalReply("כן 12345").code, null);
    assertStrictEquals(parseApprovalReply("כן 1234567").code, null);
  });
});
