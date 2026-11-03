import { expect, test } from "vitest";
import {
  resolveBoardTaskAgency,
  resolveNewTaskAgency,
  resolveTaskEffectiveAgency,
  filterTasksBySelectedAgency,
  buildTasksBoardScopeOrFilter,
  resolveTasksBoardScope,
  syncLocalTasksForAgencyFilter,
  filterTasksByBoardTenantScope,
  taskBelongsToBoardTenantScope,
} from "./taskBoardAgency.ts";
import { filterTasksByCampaignerBoardFilter } from "./taskFilters.ts";

const PROMO = "agency-promo";
const DMM = "agency-dmm";

test("header agency wins over the first-agency fallback", () => {
  expect(resolveBoardTaskAgency(PROMO, "agency-first")).toBe(PROMO);
});

test("all agencies falls back to the first loaded agency", () => {
  expect(resolveBoardTaskAgency("all", "agency-first")).toBe("agency-first");
  expect(resolveBoardTaskAgency(null, "agency-first")).toBe("agency-first");
  expect(resolveBoardTaskAgency(undefined, "agency-first")).toBe(
    "agency-first",
  );
});

test("returns null when neither source has an agency", () => {
  expect(resolveBoardTaskAgency("all", null)).toBe(null);
  expect(resolveBoardTaskAgency(undefined, undefined)).toBe(null);
});

test("a task for a client belongs to that client's agency", () => {
  expect(
    resolveNewTaskAgency({
      clientAgencyId: DMM,
      selectedAgency: PROMO,
      fallbackAgencyId: PROMO,
    }),
  ).toBe(DMM);
});

test("a task without a client uses the header agency, then the fallback", () => {
  expect(
    resolveNewTaskAgency({ selectedAgency: PROMO, fallbackAgencyId: "first" }),
  ).toBe(PROMO);
  expect(
    resolveNewTaskAgency({ selectedAgency: "all", fallbackAgencyId: "first" }),
  ).toBe("first");
});

const misstampedDmmTask = {
  id: "1",
  agency_id: PROMO,
  client_id: "client-dmm",
  clients: { agency_id: DMM },
};
const promoClientTaskStampedDmm = {
  id: "2",
  agency_id: DMM,
  client_id: "client-promo",
  clients: { agency_id: PROMO },
};
const promoTaskNoClient = {
  id: "3",
  agency_id: PROMO,
  client_id: null,
  clients: null,
};

test("the client's agency decides where a task belongs", () => {
  expect(resolveTaskEffectiveAgency(misstampedDmmTask)).toBe(DMM);
  expect(resolveTaskEffectiveAgency(promoClientTaskStampedDmm)).toBe(PROMO);
});

test("filtering to promo hides another agency's client and keeps its own", () => {
  const filtered = filterTasksBySelectedAgency(
    [misstampedDmmTask, promoClientTaskStampedDmm, promoTaskNoClient],
    PROMO,
  );
  expect(filtered.map((task) => task.id)).toStrictEqual(["2", "3"]);
});

test("filterTasksBySelectedAgency leaves the list alone for all", () => {
  const all = [misstampedDmmTask, promoClientTaskStampedDmm];
  expect(filterTasksBySelectedAgency(all, "all")).toBe(all);
  expect(filterTasksBySelectedAgency(all, null)).toBe(all);
});

test("my queue honors the header agency through the client's agency", () => {
  const myRows = [
    { ...misstampedDmmTask, campaigner_id: "staff-itay" },
    { ...promoClientTaskStampedDmm, campaigner_id: "staff-itay" },
    { ...promoTaskNoClient, campaigner_id: "staff-other" },
  ];
  const board = syncLocalTasksForAgencyFilter({
    isFetching: false,
    fetchedTasks: myRows,
    previousLocal: [],
    selectedAgency: PROMO,
    applyCampaignerFilter: (tasks) =>
      filterTasksByCampaignerBoardFilter(tasks, "mine", {
        kind: "assigned",
        campaignerId: "staff-itay",
        userId: "user-itay",
        campaignerIds: ["staff-itay"],
      }),
  });
  expect(board.map((task) => task.id)).toStrictEqual(["2"]);
});

test("my queue keeps every agency when the header is all", () => {
  const duringFetch = syncLocalTasksForAgencyFilter({
    isFetching: true,
    fetchedTasks: [],
    previousLocal: [misstampedDmmTask, promoTaskNoClient],
    selectedAgency: "all",
  });
  expect(duringFetch.map((task) => task.id)).toStrictEqual(["1", "3"]);
});

test("buildTasksBoardScopeOrFilter scopes tenant and shared agencies only", () => {
  const scope = resolveTasksBoardScope({
    tenantId: "tenant-dmm",
    crossTenantAgencyIds: ["agency-dmm-mc"],
  });
  expect(buildTasksBoardScopeOrFilter(scope)).toBe(
    "tenant_id.eq.tenant-dmm,agency_id.in.(agency-dmm-mc)",
  );
  expect(
    buildTasksBoardScopeOrFilter(
      resolveTasksBoardScope({ tenantId: "tenant-promo" }),
    ),
  ).toBe("tenant_id.eq.tenant-promo");
});

test("resolveTasksBoardScope ignores own-tenant agency ids (not cross-tenant shares)", () => {
  expect(
    resolveTasksBoardScope({
      tenantId: "tenant-promo",
      crossTenantAgencyIds: [],
    }),
  ).toStrictEqual({ type: "tenant", tenantId: "tenant-promo" });
  expect(
    resolveTasksBoardScope({
      tenantId: "tenant-promo",
      crossTenantAgencyIds: ["agency-dmm-mc"],
    }),
  ).toStrictEqual({
    type: "tenant_or_shared",
    tenantId: "tenant-promo",
    crossTenantAgencyIds: ["agency-dmm-mc"],
  });
});

test("filterTasksByBoardTenantScope keeps own tenant and shared-agency client rows", () => {
  const promoTenant = "tenant-promo";
  const sharedDmmAgency = DMM;
  const ownTenantTask = { ...promoTaskNoClient, tenant_id: promoTenant };
  const foreignSharedClientTask = {
    ...misstampedDmmTask,
    tenant_id: "tenant-dmm",
  };
  const foreignUnsharedTask = {
    id: "4",
    tenant_id: "tenant-other",
    agency_id: "agency-other",
    client_id: "client-other",
    clients: { agency_id: "agency-other" },
  };
  const rows = [ownTenantTask, foreignSharedClientTask, foreignUnsharedTask];
  expect(
    filterTasksByBoardTenantScope(rows, promoTenant, [sharedDmmAgency]).map(
      (task) => task.id,
    ),
  ).toStrictEqual(["3", "1"]);
});

test("taskBelongsToBoardTenantScope rejects cross-tenant rows without a shared client", () => {
  expect(
    taskBelongsToBoardTenantScope(
      {
        tenant_id: "tenant-dmm",
        agency_id: DMM,
        client_id: null,
        clients: null,
      },
      "tenant-promo",
      [DMM],
    ),
  ).toBe(false);
});

test("syncLocalTasksForAgencyFilter narrows during an in-flight agency switch", () => {
  const duringFetch = syncLocalTasksForAgencyFilter({
    isFetching: true,
    fetchedTasks: [],
    previousLocal: [misstampedDmmTask, promoTaskNoClient],
    selectedAgency: PROMO,
  });
  expect(duringFetch.map((task) => task.id)).toStrictEqual(["3"]);
});

test("syncLocalTasksForAgencyFilter applies settled server rows for the agency", () => {
  const settled = syncLocalTasksForAgencyFilter({
    isFetching: false,
    fetchedTasks: [misstampedDmmTask, promoClientTaskStampedDmm],
    previousLocal: [],
    selectedAgency: PROMO,
  });
  expect(settled.map((task) => task.id)).toStrictEqual(["2"]);
});
