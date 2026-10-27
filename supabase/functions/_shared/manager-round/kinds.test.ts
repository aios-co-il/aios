import { assertEquals } from "jsr:@std/assert@1";
import {
  FINDING_KIND_LABELS_HE,
  FINDING_KINDS,
  FINDING_LIVE_STATUSES,
  isFindingKind,
} from "./kinds.ts";

const MIGRATION = new URL(
  "../../../migrations/20261027100000_carmen_manager_round.sql",
  import.meta.url,
);

/** The quoted values of the first `<marker> ( ... )` list after `anchor`. */
function quotedList(sql: string, anchor: string, marker: string): string[] {
  const from = sql.indexOf(anchor);
  const open = sql.indexOf(marker, from) + marker.length;
  const close = sql.indexOf(")", open);
  return [...sql.slice(open, close).matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
}

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

Deno.test("every kind has a Hebrew label", () => {
  assertEquals(
    Object.keys(FINDING_KIND_LABELS_HE).sort(),
    [...FINDING_KINDS].sort(),
  );
  assertEquals(isFindingKind("no_contact"), true);
  assertEquals(isFindingKind("self_test"), false);
});
