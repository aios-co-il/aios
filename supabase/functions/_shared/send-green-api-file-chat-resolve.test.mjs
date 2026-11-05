import { assert, assertRejects, assertStrictEquals } from "jsr:@std/assert@1";
import {
  resolveGreenApiChatTarget,
  shouldLookupGroupChatId,
  buildSendReportWhatsAppFields,
  isValidGreenApiChatId,
  withTimeout,
  clientSendTimeoutMessage,
} from "./send-green-api-file-chat-resolve.mjs";

Deno.test(
  "SendReportDialog payload sends group and phone fallback together",
  () => {
    const fields = buildSendReportWhatsAppFields({
      tenantId: "tenant-1",
      selectedGroupId: "group-uuid-1",
      directPhone: "052-895-2666",
      clientId: "client-1",
    });
    assertStrictEquals(fields.groupId, "group-uuid-1");
    assertStrictEquals(fields.phoneNumber, "052-895-2666");
  },
);

Deno.test("group lookup runs when groupId is present", () => {
  assertStrictEquals(shouldLookupGroupChatId({ groupId: "g1" }), true);
  assertStrictEquals(shouldLookupGroupChatId({ groupId: null }), false);
});

Deno.test("missing group_chat_id without phone is rejected", () => {
  const result = resolveGreenApiChatTarget({
    groupId: "group-uuid-1",
    groupChatId: null,
    phoneNumber: null,
  });
  assertStrictEquals(result.ok, false);
  assertStrictEquals(result.error, "missing_group_chat_id");
});

Deno.test("missing group_chat_id falls back to a valid phone chat id", () => {
  const result = resolveGreenApiChatTarget({
    groupId: "group-uuid-1",
    groupChatId: null,
    phoneNumber: "052-895-2666",
    countryCode: "972",
  });
  assertStrictEquals(result.ok, true);
  assertStrictEquals(result.via, "phone_fallback");
  assertStrictEquals(result.chatId, "972528952666@c.us");
});

Deno.test("valid group_chat_id is preferred over phone", () => {
  const result = resolveGreenApiChatTarget({
    groupId: "group-uuid-1",
    groupChatId: "120363416882903532@g.us",
    phoneNumber: "052-895-2666",
  });
  assertStrictEquals(result.ok, true);
  assertStrictEquals(result.via, "group");
  assertStrictEquals(result.chatId, "120363416882903532@g.us");
});

Deno.test("bare country-code chat ids are invalid", () => {
  assertStrictEquals(isValidGreenApiChatId("972@c.us"), false);
  assertStrictEquals(isValidGreenApiChatId("972528952666@c.us"), true);
  assertStrictEquals(isValidGreenApiChatId("120363416882903532@g.us"), true);
});

Deno.test("phone-only path normalizes an Israeli mobile", () => {
  const result = resolveGreenApiChatTarget({
    groupId: null,
    groupChatId: null,
    phoneNumber: "052-895-2666",
    countryCode: "972",
  });
  assertStrictEquals(result.ok, true);
  assertStrictEquals(result.chatId, "972528952666@c.us");
});

Deno.test("withTimeout rejects a hung promise", async () => {
  const err = await assertRejects(() =>
    withTimeout(new Promise(() => {}), 30, "green_api_upstream"),
  );
  assert(
    err?.name === "TimeoutError" && String(err.message).includes("timeout"),
  );
});

Deno.test(
  "client abort maps to a timeout message and clears sending",
  async () => {
    let isSending = false;
    const hungFetch = (_url, init) =>
      new Promise((_resolve, reject) => {
        const onAbort = () => {
          const err = new Error("Aborted");
          err.name = "AbortError";
          reject(err);
        };
        if (init?.signal?.aborted) onAbort();
        else init?.signal?.addEventListener("abort", onAbort);
      });

    isSending = true;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 40);
    try {
      await hungFetch("https://example.test/send-green-api-file", {
        signal: controller.signal,
      });
    } catch (err) {
      assert(clientSendTimeoutMessage(err));
    } finally {
      clearTimeout(timeoutId);
      isSending = false;
    }
    assertStrictEquals(isSending, false);
  },
);

Deno.test(
  "screenshot case: group plus phone falls back; group without phone rejects",
  () => {
    const fields = buildSendReportWhatsAppFields({
      tenantId: "tenant-1",
      selectedGroupId: "group-uuid-imagination",
      directPhone: "052-895-2666",
      clientId: "client-1",
    });
    const missingChat = resolveGreenApiChatTarget({
      groupId: fields.groupId,
      groupChatId: null,
      phoneNumber: fields.phoneNumber,
    });
    assertStrictEquals(missingChat.ok, true);
    assertStrictEquals(missingChat.via, "phone_fallback");
    assertStrictEquals(isValidGreenApiChatId(missingChat.chatId), true);

    const noPhone = resolveGreenApiChatTarget({
      groupId: fields.groupId,
      groupChatId: null,
      phoneNumber: null,
    });
    assertStrictEquals(noPhone.ok, false);
    assertStrictEquals(noPhone.error, "missing_group_chat_id");
  },
);
