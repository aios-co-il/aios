import assert from "node:assert/strict";
import test from "node:test";
import {
  mergeLeadRelations,
  moveLeadInKanbanCache,
  parseStageBuckets,
  parseStageCounts,
  patchLeadInKanbanCache,
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
  assert.deepEqual(Object.keys(fromObject), ["new", "won"]);
  assert.equal(fromObject.new.totalCount, 3);
  assert.equal(fromObject.new.leads[0].id, "a");
  assert.deepEqual(fromObject.won, { leads: [], totalCount: 0 });

  const fromArray = parseStageBuckets([
    {
      stage: "new",
      leads: [lead("b", "new"), { name: "no id" }],
      total_count: 1,
    },
  ]);
  assert.deepEqual(
    fromArray.new.leads.map((l) => l.id),
    ["b"],
  );
  assert.deepEqual(parseStageBuckets(null), {});
});

test("parseStageCounts and stageLeadsFromPayload read one stage", () => {
  assert.deepEqual(parseStageCounts({ new: { total_count: 4 } }), { new: 4 });
  assert.deepEqual(parseStageCounts([{ stage: "won", total_count: 2 }]), {
    won: 2,
  });
  assert.equal(
    stageLeadsFromPayload({ new: { leads: [lead("a", "new")] } }, "new")[0].id,
    "a",
  );
  assert.equal(
    stageLeadsFromPayload(
      [{ stage: "new", leads: [lead("c", "new")] }],
      "new",
    )[0].id,
    "c",
  );
  assert.deepEqual(stageLeadsFromPayload({}, "new"), []);
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
  assert.equal(merged.campaign_name, "Spring");
  assert.equal(merged.response_status, "in_progress");
  assert.deepEqual(merged.agencies, { name: "Agency" });
  assert.equal(mergeLeadRelations(leads, null)[0].agencies, null);
});

test("kanban cache helpers move and patch a lead", () => {
  const cache: LeadsKanbanCache = parseStageBuckets({
    new: { leads: [lead("a", "new"), lead("b", "new")], total_count: 2 },
  });
  const moved = moveLeadInKanbanCache(cache, "a", "won");
  assert.deepEqual(
    moved?.new.leads.map((l: LeadsPageLead) => l.id),
    ["b"],
  );
  assert.equal(moved?.new.totalCount, 1);
  assert.equal(moved?.won.leads[0].status, "won");
  assert.equal(moved?.won.totalCount, 1);
  assert.equal(moveLeadInKanbanCache(undefined, "a", "won"), undefined);

  const patched = patchLeadInKanbanCache(cache, "b", {
    response_status: "not_relevant",
  });
  assert.equal(patched?.new.leads[1].response_status, "not_relevant");
  assert.equal(cache.new.leads[1].response_status, null);
});
