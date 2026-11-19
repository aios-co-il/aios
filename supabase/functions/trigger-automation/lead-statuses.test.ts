import {
  assertEquals,
  assertRejects,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import type { DbClient } from "../_shared/supabase-clients.ts";
import { moveLeadStatus } from "./lead-statuses.ts";

type LeadRow = { status: string | null; response_status: string | null };

/**
 * A stand-in for the leads table with one lead. `beforeUpdate` runs between a
 * read and the update that follows it, to play another writer.
 */
function fakeLeads(lead: LeadRow | null, beforeUpdate: () => void = () => {}) {
  const updates: Array<Record<string, unknown>> = [];
  function from() {
    let values: Record<string, unknown> | null = null;
    const expected: Record<string, unknown> = {};
    const query = {
      select: () => query,
      update(next: Record<string, unknown>) {
        values = next;
        return query;
      },
      eq(column: string, value: unknown) {
        if (column === "status" || column === "response_status") {
          expected[column] = value;
        }
        return query;
      },
      is(column: string, value: unknown) {
        expected[column] = value;
        return query;
      },
      maybeSingle() {
        if (!values) {
          return Promise.resolve({
            data: lead ? { ...lead } : null,
            error: null,
          });
        }
        beforeUpdate();
        const matches =
          lead !== null &&
          Object.entries(expected).every(
            ([column, value]) => lead[column as keyof LeadRow] === value,
          );
        if (!matches) {
          return Promise.resolve({ data: null, error: null });
        }
        Object.assign(lead, values);
        updates.push(values);
        return Promise.resolve({ data: { id: "lead-1" }, error: null });
      },
    };
    return query;
  }
  // The fake implements only the calls moveLeadStatus makes.
  return { updates, db: { from } as unknown as DbClient };
}

const toSent = { status: "sent", status_field: "response_status" };

Deno.test("moveLeadStatus", async (t) => {
  await t.step("moves the lead and reports the transition", async () => {
    const lead = { status: "new", response_status: "week" };
    const { db } = fakeLeads(lead);

    assertEquals(await moveLeadStatus(db, "tenant-1", "lead-1", toSent), {
      leadId: "lead-1",
      kind: "response_status",
      oldStatus: "week",
      newStatus: "sent",
    });
    assertStrictEquals(lead.response_status, "sent");
  });

  await t.step("moves a lead that has no status yet", async () => {
    const lead = { status: "new", response_status: null };
    const { db } = fakeLeads(lead);

    const change = await moveLeadStatus(db, "tenant-1", "lead-1", toSent);

    assertStrictEquals(change?.oldStatus, null);
    assertStrictEquals(lead.response_status, "sent");
  });

  await t.step(
    "changes nothing when the lead already has the status",
    async () => {
      const { updates, db } = fakeLeads({
        status: "new",
        response_status: "sent",
      });

      assertStrictEquals(
        await moveLeadStatus(db, "tenant-1", "lead-1", toSent),
        null,
      );
      assertEquals(updates, []);
    },
  );

  await t.step("changes nothing when the org has no such lead", async () => {
    const { db } = fakeLeads(null);

    assertStrictEquals(
      await moveLeadStatus(db, "tenant-1", "lead-1", toSent),
      null,
    );
  });

  await t.step(
    "reports the real old status when another writer got in first",
    async () => {
      const lead = { status: "new", response_status: "week" };
      let raced = false;
      const { db } = fakeLeads(lead, () => {
        if (!raced) {
          raced = true;
          lead.response_status = "closed";
        }
      });

      const change = await moveLeadStatus(db, "tenant-1", "lead-1", toSent);

      assertStrictEquals(change?.oldStatus, "closed");
      assertStrictEquals(lead.response_status, "sent");
    },
  );

  await t.step(
    "fires nothing when another writer already set the status",
    async () => {
      const lead = { status: "new", response_status: "week" };
      const { updates, db } = fakeLeads(lead, () => {
        lead.response_status = "sent";
      });

      assertStrictEquals(
        await moveLeadStatus(db, "tenant-1", "lead-1", toSent),
        null,
      );
      assertEquals(updates, []);
    },
  );

  await t.step("fails loudly when the lead keeps changing", async () => {
    const lead = { status: "new", response_status: "week" };
    let turn = 0;
    const { db } = fakeLeads(lead, () => {
      lead.response_status = `other-${turn++}`;
    });

    await assertRejects(() => moveLeadStatus(db, "tenant-1", "lead-1", toSent));
  });
});
