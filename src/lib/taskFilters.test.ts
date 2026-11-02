import { expect, test } from "vitest";
import {
  defaultTaskFilters,
  filterTasksByCampaignerBoardFilter,
  filterTasksByRelatedEntity,
  filterTasksForBoardUserPreview,
  parseTasksFilterPreset,
  resolveMineTaskAssignee,
  resolveTaskPeriodStart,
  serializeTasksFilterPreset,
  buildMineQueueOrFilter,
  isMineQueueFilter,
  taskMatchesActivityPeriod,
  taskTouchesCampaigner,
  chunkIds,
} from "./taskFilters.ts";

test("the tasks board opens on my tasks and tasks I assigned", () => {
  expect(defaultTaskFilters.campaignerId).toBe("mine_assigned");
  expect(defaultTaskFilters.openClosed).toBe("open");
});

test("mine follows the campaigner linked on the user, including owners", () => {
  const mine = resolveMineTaskAssignee({
    campaignerId: "staff-david",
    userId: "user-david",
  });
  expect(mine).toStrictEqual({
    kind: "assigned",
    campaignerId: "staff-david",
    salesPersonId: undefined,
  });
});

test("mine uses sales-person when that is the linked staff row", () => {
  const mine = resolveMineTaskAssignee({
    salesPersonId: "sales-1",
    userId: "user-1",
  });
  expect(mine).toStrictEqual({
    kind: "assigned",
    campaignerId: undefined,
    salesPersonId: "sales-1",
  });
});

test("without a staff link, mine falls back to tasks the user created", () => {
  expect(resolveMineTaskAssignee({ userId: "user-1" })).toStrictEqual({
    kind: "created_by",
    userId: "user-1",
  });
});

test("no other filter narrows the board on entry", () => {
  expect(defaultTaskFilters.taskType).toBe("all");
  expect(defaultTaskFilters.association).toBe("all");
  expect(defaultTaskFilters.period).toBe("all");
  expect(defaultTaskFilters.relatedKind).toBe("all");
});

test("isMineQueueFilter covers mine and mine_assigned", () => {
  expect(isMineQueueFilter("mine")).toBe(true);
  expect(isMineQueueFilter("mine_assigned")).toBe(true);
  expect(isMineQueueFilter("all")).toBe(false);
});

test("filterTasksByCampaignerBoardFilter keeps only mine assignments", () => {
  const rows = [
    {
      id: "1",
      campaigner_id: "staff-itay",
      sales_person_id: null,
      created_by: null,
    },
    {
      id: "2",
      campaigner_id: "staff-other",
      sales_person_id: null,
      created_by: null,
    },
  ];
  const mine = {
    kind: "assigned" as const,
    campaignerId: "staff-itay",
    userId: "user-itay",
    campaignerIds: ["staff-itay"],
  };
  expect(
    filterTasksByCampaignerBoardFilter(rows, "mine", mine).map(
      (task) => task.id,
    ),
  ).toStrictEqual(["1"]);
  expect(
    filterTasksByCampaignerBoardFilter(rows, "staff-other", mine).map(
      (task) => task.id,
    ),
  ).toStrictEqual(["2"]);
});

test("chunkIds splits long id lists for PostgREST .in()", () => {
  expect(chunkIds(["a", "b", "c"], 2)).toStrictEqual([["a", "b"], ["c"]]);
  expect(chunkIds([], 80)).toStrictEqual([]);
});

test("collaborator_for_me keeps a task in mine without embed rows", () => {
  const rows = [
    {
      id: "collab",
      campaigner_id: "staff-other",
      sales_person_id: null,
      created_by: "user-other",
      collaborator_for_me: true,
    },
    {
      id: "unrelated",
      campaigner_id: "staff-other",
      sales_person_id: null,
      created_by: "user-other",
    },
  ];
  const mine = {
    kind: "assigned" as const,
    campaignerId: "staff-itay",
    userId: "user-itay",
    campaignerIds: ["staff-itay"],
  };
  expect(
    filterTasksByCampaignerBoardFilter(rows, "mine", mine).map(
      (task) => task.id,
    ),
  ).toStrictEqual(["collab"]);
  expect(taskTouchesCampaigner(rows[0], "staff-itay")).toBe(true);
});

test("mine includes tasks where I am a collaborator", () => {
  const rows = [
    {
      id: "assigned",
      campaigner_id: "staff-itay",
      sales_person_id: null,
      created_by: null,
    },
    {
      id: "collab",
      campaigner_id: "staff-other",
      sales_person_id: null,
      created_by: "user-other",
      task_collaborators: [{ campaigner_id: "staff-itay" }],
    },
    {
      id: "unrelated",
      campaigner_id: "staff-other",
      sales_person_id: null,
      created_by: "user-other",
    },
  ];
  const mine = {
    kind: "assigned" as const,
    campaignerId: "staff-itay",
    userId: "user-itay",
    campaignerIds: ["staff-itay"],
  };
  expect(
    filterTasksByCampaignerBoardFilter(rows, "mine", mine).map(
      (task) => task.id,
    ),
  ).toStrictEqual(["assigned", "collab"]);
  expect(taskTouchesCampaigner(rows[1], "staff-itay")).toBe(true);
  expect(
    filterTasksByCampaignerBoardFilter(rows, "staff-itay", mine).map(
      (task) => task.id,
    ),
  ).toStrictEqual(["assigned", "collab"]);
});

test("mine_assigned keeps tasks I assigned to someone else", () => {
  const rows = [
    {
      id: "assigned-to-me",
      campaigner_id: "staff-itay",
      sales_person_id: null,
      created_by: "user-other",
    },
    {
      id: "i-assigned",
      campaigner_id: "staff-other",
      sales_person_id: null,
      created_by: "user-itay",
    },
    {
      id: "unrelated",
      campaigner_id: "staff-other",
      sales_person_id: null,
      created_by: "user-other",
    },
  ];
  const mine = {
    kind: "assigned" as const,
    campaignerId: "staff-itay",
    userId: "user-itay",
    campaignerIds: ["staff-itay"],
  };
  expect(
    filterTasksByCampaignerBoardFilter(rows, "mine", mine).map(
      (task) => task.id,
    ),
  ).toStrictEqual(["assigned-to-me"]);
  expect(
    filterTasksByCampaignerBoardFilter(rows, "mine_assigned", mine).map(
      (task) => task.id,
    ),
  ).toStrictEqual(["assigned-to-me", "i-assigned"]);
});

test("buildMineQueueOrFilter adds created_by for mine_assigned", () => {
  const identity = {
    kind: "assigned" as const,
    campaignerId: "c1",
    userId: "user-1",
    campaignerIds: ["c1"],
  };
  expect(buildMineQueueOrFilter(identity, "mine")).toBe("campaigner_id.eq.c1");
  expect(buildMineQueueOrFilter(identity, "mine_assigned")).toBe(
    "campaigner_id.eq.c1,created_by.eq.user-1",
  );
});

test("filter preset round-trips campaigner, period, and related entity", () => {
  const stored = serializeTasksFilterPreset({
    campaignerId: "mine",
    taskType: "campaign",
    association: "clients",
    period: "month",
    relatedKind: "lead",
    relatedId: "lead-1",
    relatedLabel: "דלתא",
    openClosed: "done",
  });
  const parsed = parseTasksFilterPreset(stored);
  expect(parsed.campaignerId).toBe("mine");
  expect(parsed.taskType).toBe("campaign");
  expect(parsed.period).toBe("month");
  expect(parsed.relatedKind).toBe("lead");
  expect(parsed.relatedId).toBe("lead-1");
  expect(parsed.relatedLabel).toBe("דלתא");
  expect(parsed.openClosed).toBe("done");
});

test("period window uses week/month starts and rolling 3 months / year", () => {
  const now = new Date(2026, 8, 17);
  const week = resolveTaskPeriodStart("week", now);
  const month = resolveTaskPeriodStart("month", now);
  expect(week?.getDate()).toBe(13);
  expect(month?.getDate()).toBe(1);
  expect(month?.getMonth()).toBe(8);
  expect(resolveTaskPeriodStart("all", now)).toBe(undefined);
  const three = resolveTaskPeriodStart("quarter", now);
  expect(three?.getMonth()).toBe(5);
  expect(
    taskMatchesActivityPeriod(
      { status: "open", created_at: "2026-09-10T10:00:00" },
      month,
    ),
  ).toBe(true);
  expect(
    taskMatchesActivityPeriod(
      { status: "open", created_at: "2026-07-01T10:00:00" },
      month,
    ),
  ).toBe(false);
  expect(
    taskMatchesActivityPeriod(
      {
        status: "done",
        updated_at: "2026-09-16T10:00:00",
        created_at: "2026-01-01T10:00:00",
      },
      month,
    ),
  ).toBe(false);
  expect(
    taskMatchesActivityPeriod(
      {
        status: "done",
        updated_at: "2026-09-16T10:00:00",
        created_at: "2026-09-02T10:00:00",
      },
      month,
    ),
  ).toBe(true);
});

test("old clientId presets map onto the related-entity filter", () => {
  const fromClient = parseTasksFilterPreset({ clientId: "client-9" });
  expect(fromClient.relatedKind).toBe("client");
  expect(fromClient.relatedId).toBe("client-9");
  const fromNone = parseTasksFilterPreset({ clientId: "none" });
  expect(fromNone.relatedKind).toBe("none");
});

test("filterTasksByRelatedEntity matches client, lead, or unassigned", () => {
  const rows = [
    { id: "1", client_id: "c1", lead_id: null },
    { id: "2", client_id: null, lead_id: "l1" },
    { id: "3", client_id: null, lead_id: null },
  ];
  expect(
    filterTasksByRelatedEntity(rows, "client", "c1").map((task) => task.id),
  ).toStrictEqual(["1"]);
  expect(
    filterTasksByRelatedEntity(rows, "lead", "l1").map((task) => task.id),
  ).toStrictEqual(["2"]);
  expect(
    filterTasksByRelatedEntity(rows, "none").map((task) => task.id),
  ).toStrictEqual(["3"]);
  expect(filterTasksByRelatedEntity(rows, "all").length).toBe(3);
});

test("filterTasksForBoardUserPreview hides other users' tasks in view-as mode", () => {
  const rows = [
    {
      id: "1",
      campaigner_id: "staff-felix",
      sales_person_id: null,
      created_by: "user-felix",
    },
    {
      id: "2",
      campaigner_id: "staff-david",
      sales_person_id: null,
      created_by: "user-david",
    },
    {
      id: "3",
      campaigner_id: null,
      sales_person_id: null,
      created_by: "user-david",
    },
  ];
  const felix = {
    kind: "assigned" as const,
    campaignerId: "staff-felix",
    userId: "user-felix",
    campaignerIds: ["staff-felix"],
  };
  expect(
    filterTasksForBoardUserPreview(rows, "user-felix", felix).map(
      (task) => task.id,
    ),
  ).toStrictEqual(["1"]);
});
