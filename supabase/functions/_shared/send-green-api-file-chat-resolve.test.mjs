import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveGreenApiChatTarget,
  shouldLookupGroupChatId,
  buildSendReportWhatsAppFields,
  isValidGreenApiChatId,
  withTimeout,
  clientSendTimeoutMessage,
  greenApiUploadEndpoints,
  GREEN_API_UPSTREAM_TIMEOUT_MS,
  SEND_REPORT_CLIENT_TIMEOUT_MS,
} from "./send-green-api-file-chat-resolve.mjs";

test("SendReportDialog payload sends group and phone fallback together", () => {
  const fields = buildSendReportWhatsAppFields({
    tenantId: "tenant-1",
    selectedGroupId: "group-uuid-1",
    directPhone: "052-895-2666",
    clientId: "client-1",
  });
  assert.equal(fields.groupId, "group-uuid-1");
  assert.equal(fields.phoneNumber, "052-895-2666");
});

test("group lookup runs when groupId is present", () => {
  assert.equal(shouldLookupGroupChatId({ groupId: "g1" }), true);
  assert.equal(shouldLookupGroupChatId({ groupId: null }), false);
});

test("missing group_chat_id without phone is rejected", () => {
  const result = resolveGreenApiChatTarget({
    groupId: "group-uuid-1",
    groupChatId: null,
    phoneNumber: null,
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, "missing_group_chat_id");
});

test("missing group_chat_id falls back to a valid phone chat id", () => {
  const result = resolveGreenApiChatTarget({
    groupId: "group-uuid-1",
    groupChatId: null,
    phoneNumber: "052-895-2666",
    countryCode: "972",
  });
  assert.equal(result.ok, true);
  assert.equal(result.via, "phone_fallback");
  assert.equal(result.chatId, "972528952666@c.us");
});

test("valid group_chat_id is preferred over phone", () => {
  const result = resolveGreenApiChatTarget({
    groupId: "group-uuid-1",
    groupChatId: "120363416882903532@g.us",
    phoneNumber: "052-895-2666",
  });
  assert.equal(result.ok, true);
  assert.equal(result.via, "group");
  assert.equal(result.chatId, "120363416882903532@g.us");
});

test("bare country-code chat ids are invalid", () => {
  assert.equal(isValidGreenApiChatId("972@c.us"), false);
  assert.equal(isValidGreenApiChatId("972528952666@c.us"), true);
  assert.equal(isValidGreenApiChatId("120363416882903532@g.us"), true);
});

test("phone-only path normalizes an Israeli mobile", () => {
  const result = resolveGreenApiChatTarget({
    groupId: null,
    groupChatId: null,
    phoneNumber: "052-895-2666",
    countryCode: "972",
  });
  assert.equal(result.ok, true);
  assert.equal(result.chatId, "972528952666@c.us");
});

test("withTimeout rejects a hung promise", async () => {
  await assert.rejects(
    () => withTimeout(new Promise(() => {}), 30, "green_api_upstream"),
    (err) =>
      err?.name === "TimeoutError" && String(err.message).includes("timeout"),
  );
});

test("client abort maps to a timeout message and clears sending", async () => {
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
    assert.ok(clientSendTimeoutMessage(err));
  } finally {
    clearTimeout(timeoutId);
    isSending = false;
  }
  assert.equal(isSending, false);
});

test("screenshot case: group plus phone falls back; group without phone rejects", () => {
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
  assert.equal(missingChat.ok, true);
  assert.equal(missingChat.via, "phone_fallback");
  assert.equal(isValidGreenApiChatId(missingChat.chatId), true);

  const noPhone = resolveGreenApiChatTarget({
    groupId: fields.groupId,
    groupChatId: null,
    phoneNumber: null,
  });
  assert.equal(noPhone.ok, false);
  assert.equal(noPhone.error, "missing_group_chat_id");
});

test("uploads go to the instance media host first, legacy host as fallback", () => {
  assert.deepEqual(greenApiUploadEndpoints("7103954455", "tok"), [
    "https://7103.media.greenapi.com/waInstance7103954455/sendFileByUpload/tok",
    "https://api.green-api.com/waInstance7103954455/sendFileByUpload/tok",
  ]);
  assert.equal(
    greenApiUploadEndpoints(
      "7103954455",
      "tok",
      "https://9999.media.greenapi.com/",
    )[0],
    "https://9999.media.greenapi.com/waInstance7103954455/sendFileByUpload/tok",
  );
  // Two attempts must finish before the browser gives up.
  assert.ok(GREEN_API_UPSTREAM_TIMEOUT_MS * 2 < SEND_REPORT_CLIENT_TIMEOUT_MS);
});
