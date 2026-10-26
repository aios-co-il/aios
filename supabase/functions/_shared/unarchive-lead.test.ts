import { assertStrictEquals } from "jsr:@std/assert@1";
import { unarchiveExistingLead } from "./unarchive-lead.ts";

Deno.test(
  "unarchiveExistingLead restores archived rows and is a no-op otherwise",
  () => {
    const archived: Record<string, unknown> = { notes: "x" };
    assertStrictEquals(
      unarchiveExistingLead({ archived_at: "2026-08-25T00:00:00Z" }, archived),
      true,
    );
    assertStrictEquals(archived.archived_at, null);
    assertStrictEquals(archived.archived_by, null);

    const live: Record<string, unknown> = {};
    assertStrictEquals(
      unarchiveExistingLead({ archived_at: null }, live),
      false,
    );
    assertStrictEquals(unarchiveExistingLead(null, live), false);
  },
);
