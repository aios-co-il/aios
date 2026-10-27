import { assertEquals } from "jsr:@std/assert@1";
import {
  FINDING_KIND_LABELS_HE,
  FINDING_KINDS,
  FINDING_LIVE_STATUSES,
  FINDING_ROUTABLE_STATUSES,
  isFindingKind,
} from "./kinds.ts";
import {
  MANAGER_ROUND_MIGRATION as MIGRATION,
  quotedList,
} from "./migration-lists.ts";

Deno.test("FINDING_KINDS matches the carmen_findings kind CHECK", async () => {
  const sql = await Deno.readTextFile(MIGRATION);
  assertEquals(quotedList(sql, "kind text NOT NULL", "CHECK (kind IN ("), [
    ...FINDING_KINDS,
  ]);
});

Deno.test("FINDING_LIVE_STATUSES matches the live dedupe index", async () => {
  const sql = await Deno.readTextFile(MIGRATION);
  assertEquals(
    quotedList(sql, "carmen_findings_live_key", "WHERE status IN ("),
    [...FINDING_LIVE_STATUSES],
  );
});

Deno.test("FINDING_ROUTABLE_STATUSES matches the route index", async () => {
  const sql = await Deno.readTextFile(MIGRATION);
  assertEquals(
    quotedList(sql, "carmen_findings_route_idx", "WHERE status IN ("),
    [...FINDING_ROUTABLE_STATUSES],
  );
});

Deno.test("every kind has a Hebrew label", () => {
  assertEquals(
    Object.keys(FINDING_KIND_LABELS_HE).sort(),
    [...FINDING_KINDS].sort(),
  );
  assertEquals(isFindingKind("no_contact"), true);
  assertEquals(isFindingKind("self_test"), false);
});
