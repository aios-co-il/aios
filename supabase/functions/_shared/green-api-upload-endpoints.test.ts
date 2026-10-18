import assert from "node:assert/strict";
import test from "node:test";

import { greenApiUploadEndpoints } from "./green-api-upload-endpoints.ts";
import {
  GREEN_API_UPSTREAM_TIMEOUT_MS,
  SEND_REPORT_CLIENT_TIMEOUT_MS,
} from "./send-green-api-file-chat-resolve.mjs";

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
});

test("two upload attempts fit inside the browser wait", () => {
  assert.ok(GREEN_API_UPSTREAM_TIMEOUT_MS * 2 < SEND_REPORT_CLIENT_TIMEOUT_MS);
});
