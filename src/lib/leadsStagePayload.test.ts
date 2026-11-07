import { expect, test } from "vitest";
import {
  mergeLeadRelations,
  moveLeadInKanbanCache,
  parseStageBuckets,
  parseStageCounts,
  patchLeadInKanbanCache,
  leadsPageLeadSchema,
  stageLeadsFromPayload,
} from "./leadsStagePayload.ts";
import type { LeadsKanbanCache, LeadsPageLead } from "../types/leadsPage.ts";

const lead = (id: string, status: string) => ({
  id,
  status,
  response_status: null,
});

test("parseStageBuckets reads the object and the array RPC formats", () => {
  const fromObject = parseStageBuckets({
    new: { leads: [lead("a", "new")], total_count: 3 },
    won: { leads: null, total_count: null },
  });
  expect(Object.keys(fromObject)).toStrictEqual(["new", "won"]);
  expect(fromObject.new.totalCount).toBe(3);
  expect(fromObject.new.leads[0].id).toBe("a");
  expect(fromObject.won).toStrictEqual({ leads: [], totalCount: 0 });

  const fromArray = parseStageBuckets([
    {
      stage: "new",
      leads: [lead("b", "new"), { name: "no id" }],
      total_count: 1,
    },
  ]);
  expect(fromArray.new.leads.map((l) => l.id)).toStrictEqual(["b"]);
  expect(parseStageBuckets(null)).toStrictEqual({});
});

test("parseStageCounts and stageLeadsFromPayload read one stage", () => {
  expect(parseStageCounts({ new: { total_count: 4 } })).toStrictEqual({
    new: 4,
  });
  expect(parseStageCounts([{ stage: "won", total_count: 2 }])).toStrictEqual({
    won: 2,
  });
  expect(
    stageLeadsFromPayload({ new: { leads: [lead("a", "new")] } }, "new")[0].id,
  ).toBe("a");
  expect(
    stageLeadsFromPayload(
      [{ stage: "new", leads: [lead("c", "new")] }],
      "new",
    )[0].id,
  ).toBe("c");
  expect(stageLeadsFromPayload({}, "new")).toStrictEqual([]);
});

test("mergeLeadRelations overlays relation columns", () => {
  const leads = parseStageBuckets({ new: { leads: [lead("a", "new")] } }).new
    .leads;
  const [merged] = mergeLeadRelations(leads, [
    {
      id: "a",
      campaign_name: "Spring",
      source: "website",
      response_status: "in_progress",
      agencies: { name: "Agency" },
      sales_people: null,
    },
  ]);
  expect(merged.campaign_name).toBe("Spring");
  expect(merged.response_status).toBe("in_progress");
  expect(merged.agencies).toStrictEqual({ name: "Agency" });
  expect(mergeLeadRelations(leads, null)[0].agencies).toBe(null);
});

test("kanban cache helpers move and patch a lead", () => {
  const cache: LeadsKanbanCache = parseStageBuckets({
    new: { leads: [lead("a", "new"), lead("b", "new")], total_count: 2 },
  });
  const moved = moveLeadInKanbanCache(cache, "a", "won");
  expect(moved?.new.leads.map((l: LeadsPageLead) => l.id)).toStrictEqual(["b"]);
  expect(moved?.new.totalCount).toBe(1);
  expect(moved?.won.leads[0].status).toBe("won");
  expect(moved?.won.totalCount).toBe(1);
  expect(moveLeadInKanbanCache(undefined, "a", "won")).toBe(undefined);

  const patched = patchLeadInKanbanCache(cache, "b", {
    response_status: "not_relevant",
  });
  expect(patched?.new.leads[1].response_status).toBe("not_relevant");
  expect(cache.new.leads[1].response_status).toBe(null);
});

test("stage payload parsing tolerates malformed stages", () => {
  expect(
    parseStageBuckets({
      new: { leads: "x", total_count: "3" },
      won: null,
      lost: [lead("z", "lost")],
    }),
  ).toStrictEqual({
    new: { leads: [], totalCount: 0 },
    won: { leads: [], totalCount: 0 },
    lost: { leads: [], totalCount: 0 },
  });
  expect(parseStageCounts("text")).toStrictEqual({});
  expect(parseStageCounts(42)).toStrictEqual({});
  expect(stageLeadsFromPayload([null, { stage: "new" }], "new")).toStrictEqual(
    [],
  );
});

test("leadsPageLeadSchema keeps rows with a string id as-is", () => {
  const row = lead("a", "new");
  expect(leadsPageLeadSchema.safeParse(row).data).toBe(row);
  expect(leadsPageLeadSchema.safeParse({ id: 1 }).success).toBe(false);
  expect(leadsPageLeadSchema.safeParse(null).success).toBe(false);
});
