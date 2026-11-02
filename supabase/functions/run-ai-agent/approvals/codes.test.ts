import {
  assert,
  assertEquals,
  assertMatch,
  assertNotStrictEquals,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import { formatApprovalPickReply } from "./chat-text.ts";
import {
  approvalCodeMatches,
  approvalDisplayCode,
  approvalLongCode,
  approvalShortCode,
} from "./codes.ts";
import { parseApprovalReply } from "./reply.ts";
import { resolveApprovalConfirm } from "./resolve.ts";
import { DANA, ID1, ID3, NOW, owner, row } from "./test-fixtures.ts";
import { approvalPickToolResult } from "./tool-result.ts";

Deno.test("approvalShortCode", async (t) => {
  await t.step(
    "short codes are stable 4-digit codes that avoid years and round hundreds",
    () => {
      assertStrictEquals(approvalShortCode(ID1), approvalShortCode(ID1));
      assertMatch(approvalShortCode(ID1), /^\d{4}$/);
      for (let i = 0; i < 2000; i++) {
        const id = `${i.toString(16).padStart(8, "0")}-0000-4000-8000-000000000000`;
        const n = Number(approvalShortCode(id));
        assert(!(n >= 1900 && n <= 2099), id);
        assertNotStrictEquals(n % 100, 0, id);
      }
    },
  );
});

Deno.test("approvalDisplayCode", async (t) => {
  await t.step(
    "colliding short codes get 6-digit codes so each row can still be picked",
    () => {
      const twin = collidingId(ID1);
      assertStrictEquals(approvalShortCode(twin), approvalShortCode(ID1));
      assertNotStrictEquals(approvalLongCode(twin), approvalLongCode(ID1));
      const rows = [
        row(ID1, { requested_by: DANA }),
        row(twin, { requested_by: DANA }),
        row(ID3, { requested_by: DANA }),
      ];
      // The shared 4 digits are ambiguous; nothing runs.
      const ambiguous = resolveApprovalConfirm(rows, {
        ...owner,
        code: approvalShortCode(ID1),
      });
      assertStrictEquals(ambiguous.kind, "ambiguous");
      const reply = formatApprovalPickReply(ambiguous, { nowMs: NOW });
      assert(reply.includes(approvalLongCode(ID1)), reply);
      assert(reply.includes(approvalLongCode(twin)), reply);
      // Only colliding rows get the long code.
      assertStrictEquals(
        approvalDisplayCode(rows[2], rows),
        approvalShortCode(ID3),
      );
      assertStrictEquals(
        approvalDisplayCode(rows[0], rows),
        approvalLongCode(ID1),
      );
      assertStrictEquals(
        approvalDisplayCode(rows[0], [rows[0]]),
        approvalShortCode(ID1),
      );
      // "כן <6 digits>" picks exactly one.
      for (const id of [ID1, twin]) {
        const reply6 = parseApprovalReply(`כן ${approvalLongCode(id)}`);
        assertStrictEquals(reply6.approve, true);
        const pick = resolveApprovalConfirm(rows, {
          ...owner,
          code: reply6.code,
        });
        assertStrictEquals(pick.kind, "match");
        assertStrictEquals(pick.row.id, id);
      }
      // Tool results list the long codes too.
      const tool = approvalPickToolResult(ambiguous, { nowMs: NOW });
      assertEquals(
        tool.candidates.map((c) => c.code).sort(),
        [approvalLongCode(ID1), approvalLongCode(twin)].sort(),
      );
      assertStrictEquals(
        approvalCodeMatches(rows[2], approvalShortCode(ID3)),
        true,
      );
      assertStrictEquals(
        approvalCodeMatches(rows[2], approvalLongCode(ID1)),
        false,
      );
    },
  );
});

/** Another id whose 4-digit code equals `id`'s. */
function collidingId(id: string): string {
  const code = approvalShortCode(id);
  for (let i = 0; i < 1_000_000; i++) {
    const other = `${i.toString(16).padStart(8, "0")}-0000-4000-8000-000000000009`;
    if (other !== id && approvalShortCode(other) === code) {
      return other;
    }
  }

  throw new Error("no collision found");
}
