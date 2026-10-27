import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import {
  DELETION_REQUEST_STATUSES,
  isDeletionRequestStatusValue,
  readDeletionRequestStatus,
} from "./contract.ts";

const ROW = {
  confirmation_code: "0123456789abcdef",
  status: "received",
  created_at: "2026-10-22T10:00:00.000Z",
};

Deno.test("contract: every DB status value is accepted", () => {
  for (const status of DELETION_REQUEST_STATUSES) {
    assertStrictEquals(isDeletionRequestStatusValue(status), true);
  }
  assertStrictEquals(isDeletionRequestStatusValue("deleted"), false);
});

Deno.test("contract: reads a stored row and drops extra fields", () => {
  assertEquals(readDeletionRequestStatus({ ...ROW, fb_user_id: "1" }), ROW);
});

Deno.test(
  "contract: rejects rows with a missing field or unknown status",
  () => {
    assertStrictEquals(readDeletionRequestStatus(null), null);
    assertStrictEquals(readDeletionRequestStatus("x"), null);
    assertStrictEquals(
      readDeletionRequestStatus({ ...ROW, status: "gone" }),
      null,
    );
    assertStrictEquals(
      readDeletionRequestStatus({ ...ROW, created_at: undefined }),
      null,
    );
    assertStrictEquals(
      readDeletionRequestStatus({ ...ROW, confirmation_code: 1 }),
      null,
    );
  },
);
