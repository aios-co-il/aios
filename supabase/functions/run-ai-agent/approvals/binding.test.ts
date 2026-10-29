import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import {
  approvalBindingContext,
  approvalConversationKey,
  mergeApprovalBinding,
} from "./binding.ts";
import { DANA, DAVID } from "./test-fixtures.ts";

Deno.test("approvalConversationKey", async (t) => {
  await t.step(
    "conversation keys: chat id, WhatsApp chat, phone fallback, none",
    () => {
      assertStrictEquals(
        approvalConversationKey({ conversationId: "c1" }),
        "conv:c1",
      );
      assertStrictEquals(
        approvalConversationKey({
          surface: "whatsapp",
          waChatId: "972501234567@c.us",
        }),
        "wa:972501234567@c.us",
      );
      assertStrictEquals(
        approvalConversationKey({
          surface: "whatsapp",
          phone: "+972-50-123-4567",
        }),
        "wa_phone:501234567",
      );
      assertStrictEquals(approvalConversationKey({ surface: "task" }), null);
      assertStrictEquals(approvalBindingContext({ surface: "task" }), null);
    },
  );
});

Deno.test("mergeApprovalBinding", async (t) => {
  await t.step(
    "binding is stamped only on the requester's own unbound row",
    () => {
      const binding = approvalBindingContext({
        surface: "aios",
        conversationId: "c1",
      });
      const fresh = { requested_by: DAVID, context: { caller_role: "owner" } };
      assertEquals(mergeApprovalBinding(fresh, { userId: DAVID, binding }), {
        caller_role: "owner",
        conversation_key: "conv:c1",
        conversation_surface: "aios",
      });
      assertStrictEquals(
        mergeApprovalBinding(fresh, { userId: DANA, binding }),
        null,
      );
      assertStrictEquals(
        mergeApprovalBinding(
          { requested_by: DAVID, context: { conversation_key: "conv:x" } },
          { userId: DAVID, binding },
        ),
        null,
      );
      assertStrictEquals(
        mergeApprovalBinding(fresh, { userId: DAVID, binding: null }),
        null,
      );
    },
  );
});
