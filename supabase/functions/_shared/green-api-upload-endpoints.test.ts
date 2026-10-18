import assert from "node:assert/strict";
import test from "node:test";

import {
  greenApiUploadEndpoints,
  isPreSubmitConnectError,
} from "./green-api-upload-endpoints.ts";
import {
  CHAT_MESSAGES_INSERT_TIMEOUT_MS,
  GREEN_API_UPSTREAM_TIMEOUT_MS,
  SEND_REPORT_CLIENT_TIMEOUT_MS,
} from "./send-green-api-file-chat-resolve.mjs";

test("uploads go to the instance media host first, legacy host as fallback", () => {
  assert.deepEqual(greenApiUploadEndpoints("7103954455", "tok"), [
    "https://7103.media.greenapi.com/waInstance7103954455/sendFileByUpload/tok",
    "https://api.green-api.com/waInstance7103954455/sendFileByUpload/tok",
  ]);
});

test("only connect-stage failures move to the next host", () => {
  // Production error from 2026-10-18: TLS handshake failed before sending.
  assert.equal(
    isPreSubmitConnectError(
      new TypeError(
        "error sending request for url (https://api.green-api.com/x): client error (Connect): tls handshake eof",
      ),
    ),
    true,
  );
  assert.equal(
    isPreSubmitConnectError(new Error("Green API timeout after 25000ms")),
    false,
  );
  const timeout = new Error("signal timed out");
  timeout.name = "TimeoutError";
  assert.equal(isPreSubmitConnectError(timeout), false);
  assert.equal(
    isPreSubmitConnectError(new Error("connection reset by peer")),
    false,
  );
});

test("one timed-out attempt plus the log insert fits inside the browser wait", () => {
  // A retry only follows a fast connect failure, so the worst case is one
  // full attempt plus the chat_messages insert.
  assert.ok(
    GREEN_API_UPSTREAM_TIMEOUT_MS + CHAT_MESSAGES_INSERT_TIMEOUT_MS <
      SEND_REPORT_CLIENT_TIMEOUT_MS,
  );
});
