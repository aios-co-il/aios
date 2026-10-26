import { expect, test } from "vitest";
import {
  applyLeadExportTenantScope,
  buildLeadExportRows,
  collectFormDataKeys,
  formatLeadExportUpdate,
  leadExportMatchesPageScope,
  leadMatchesTagFilter,
  type LeadExportRecord,
} from "./exportLeads.ts";

const stages = [
  { stage_key: "new", label: "חדש" },
  { stage_key: "closed", label: "נסגר" },
];

const statuses = [
  { status_key: "no_answer_1", label: "אין מענה 1" },
  { status_key: "in_progress", label: "בעבודה" },
];

test("leadMatchesTagFilter keeps all leads when no tag filter is set", () => {
  expect(leadMatchesTagFilter(["FB"], ["t1"], [], new Set())).toBe(true);
});

test("leadMatchesTagFilter none shows only untagged leads", () => {
  expect(leadMatchesTagFilter([], [], ["none"], new Set())).toBe(true);
  expect(leadMatchesTagFilter(["FB"], ["t1"], ["none"], new Set(["t1"]))).toBe(
    false,
  );
});

test("leadMatchesTagFilter selected tags keep matching leads", () => {
  expect(leadMatchesTagFilter(["FB"], ["t1"], ["t1"], new Set(["t1"]))).toBe(
    true,
  );
  expect(leadMatchesTagFilter(["אתר"], ["t2"], ["t1"], new Set(["t1"]))).toBe(
    false,
  );
});

test("buildLeadExportRows maps fields, tags, statuses and numbered updates", () => {
  const leads: LeadExportRecord[] = [
    {
      id: "1",
      contact_name: "יוסי",
      company_name: "חברה",
      phone: "0501234567",
      email: "a@b.com",
      status: "new",
      response_status: "no_answer_1",
      source: "paid_ads",
      campaign_name: "קיץ",
      tagNames: ["FB", "חם"],
      updates: [
        {
          content: "התקשרתי",
          created_at: "2026-08-01T08:00:00.000Z",
          author_name: "דוד",
        },
        {
          content: "אין מענה",
          created_at: "2026-08-02T09:30:00.000Z",
          author_name: "צחי",
        },
      ],
      agencies: { name: "צחי קווטנסקי" },
      sales_people: { full_name: "נציג" },
      form_data: { city: "תל אביב" },
    },
    {
      id: "2",
      contact_name: "רק אחד",
      status: "closed",
      response_status: "in_progress",
      source: "website",
      tagNames: [],
      updates: [
        {
          content: "נסגר",
          created_at: "2026-08-03T10:00:00.000Z",
          author_name: "",
        },
      ],
    },
  ];

  const rows = buildLeadExportRows(leads, stages, statuses);
  expect(rows.length).toBe(2);
  expect(rows[0]["שם איש קשר"]).toBe("יוסי");
  expect(rows[0]["שלב"]).toBe("חדש");
  expect(rows[0]["סטטוס תגובה"]).toBe("אין מענה 1");
  expect(rows[0]["תגיות"]).toBe("FB, חם");
  expect(rows[0]["מקור"]).toBe("FB");
  expect(rows[0]["שם קמפיין"]).toBe("קיץ");
  expect(rows[0]["סוכנות"]).toBe("צחי קווטנסקי");
  expect(String(rows[0]["עדכון 1"])).toMatch(/התקשרתי/);
  expect(String(rows[0]["עדכון 2"])).toMatch(/אין מענה/);
  expect(rows[0]["טופס: city"]).toBe("תל אביב");
  expect(rows[1]["שלב"]).toBe("נסגר");
  expect(rows[1]["עדכון 2"]).toBe("");
  expect("עדכון 1" in rows[1]).toBeTruthy();
  expect("עדכון 2" in rows[1]).toBeTruthy();
});

test("collectFormDataKeys gathers unique form fields", () => {
  expect(
    collectFormDataKeys([
      { id: "1", form_data: { b: "2", a: "1" } },
      { id: "2", form_data: { a: "3" } },
    ]),
  ).toStrictEqual(["a", "b"]);
});

test("formatLeadExportUpdate joins date, author and content", () => {
  const text = formatLeadExportUpdate({
    content: "  חזרתי  אליו  ",
    created_at: "2026-08-01",
    author_name: "דוד",
  });
  expect(text).toMatch(/דוד/);
  expect(text).toMatch(/חזרתי אליו/);
});

test("owner export keeps all current-tenant leads when an agency is selected", () => {
  const calls: Array<[string, ...unknown[]]> = [];
  const query = {
    eq: (...args: unknown[]) => {
      calls.push(["eq", ...args]);
      return query;
    },
    or: (...args: unknown[]) => {
      calls.push(["or", ...args]);
      return query;
    },
  };
  applyLeadExportTenantScope(query, {
    tenantId: "tenant-1",
    isOwner: true,
    selectedAgency: "agency-b",
  });
  expect(
    calls.some((call) => call[0] === "eq" && call[1] === "agency_id"),
  ).toBe(false);
  expect(
    calls.some(
      (call) =>
        call[0] === "or" && String(call[1]).includes("tenant_id.eq.tenant-1"),
    ),
  ).toBe(true);
  expect(
    leadExportMatchesPageScope(
      { tenant_id: "tenant-1", agency_id: "agency-a" },
      { tenantId: "tenant-1", isOwner: true },
    ),
  ).toBe(true);
  expect(
    leadExportMatchesPageScope(
      { tenant_id: "other", agency_id: "agency-b" },
      { tenantId: "tenant-1", isOwner: true },
    ),
  ).toBe(false);
});

function makeClient(
  tables: Record<string, any[]>,
  ordersByTable: Record<
    string,
    Array<{ column: string; ascending?: boolean }>
  > = {},
) {
  return {
    from(table: string) {
      const rows = tables[table] || [];
      const state = {
        from: 0,
        to: Math.max(rows.length - 1, 0),
        usedRange: false,
      };
      ordersByTable[table] = [];
      const api: any = {
        select: () => api,
        eq: () => api,
        is: () => api,
        in: () => api,
        or: () => api,
        gte: () => api,
        lte: () => api,
        order: (column: string, opts?: { ascending?: boolean }) => {
          ordersByTable[table].push({ column, ascending: opts?.ascending });
          return api;
        },
        range: (from: number, to: number) => {
          state.from = from;
          state.to = to;
          state.usedRange = true;
          return api;
        },
        then: (resolve: any, reject: any) => {
          const slice = state.usedRange
            ? rows.slice(state.from, state.to + 1)
            : rows;
          return Promise.resolve({ data: slice, error: null }).then(
            resolve,
            reject,
          );
        },
      };
      return api;
    },
  };
}

test("fetchAllLeadsForExport pages past the loaded UI window", async () => {
  const { fetchAllLeadsForExport } = await import("./exportLeads.ts");
  const leadRows = Array.from({ length: 1205 }, (_, i) => ({
    id: `lead-${i}`,
    tenant_id: "tenant-1",
    contact_name: `n${i}`,
    created_at: "2026-08-01T00:00:00.000Z",
    status: "new",
    source: "website",
  }));
  const ordersByTable: Record<
    string,
    Array<{ column: string; ascending?: boolean }>
  > = {};
  const supabase = makeClient(
    {
      leads: leadRows,
      chat_contact_tags: [],
      lead_updates: [],
      lead_pipeline_stages: [{ stage_key: "new", label: "חדש" }],
      lead_statuses: [],
    },
    ordersByTable,
  );
  const { leads } = await fetchAllLeadsForExport(supabase, {
    tenantId: "tenant-1",
    isOwner: true,
  });
  expect(leads.length).toBe(1205);
  expect(ordersByTable.leads).toStrictEqual([
    { column: "created_at", ascending: false },
    { column: "id", ascending: false },
  ]);
});

test("paged tag and update queries use a unique id order", async () => {
  const { fetchAllLeadsForExport } = await import("./exportLeads.ts");
  const ordersByTable: Record<
    string,
    Array<{ column: string; ascending?: boolean }>
  > = {};
  const supabase = makeClient(
    {
      leads: [
        {
          id: "lead-1",
          tenant_id: "tenant-1",
          created_at: "2026-08-01T00:00:00.000Z",
          status: "new",
        },
      ],
      chat_contact_tags: [
        {
          id: "tag-row-1",
          lead_id: "lead-1",
          tag_id: "t1",
          chat_tags: { name: "FB" },
        },
      ],
      lead_updates: [
        {
          id: "upd-1",
          lead_id: "lead-1",
          content: "hi",
          created_at: "2026-08-01T00:00:00.000Z",
          user_id: "u1",
        },
      ],
      lead_pipeline_stages: [{ stage_key: "new", label: "חדש" }],
      lead_statuses: [],
    },
    ordersByTable,
  );
  await fetchAllLeadsForExport(supabase, {
    tenantId: "tenant-1",
    isOwner: true,
  });
  expect(ordersByTable.chat_contact_tags).toStrictEqual([
    { column: "id", ascending: true },
  ]);
  expect(ordersByTable.lead_updates).toStrictEqual([
    { column: "created_at", ascending: true },
    { column: "id", ascending: true },
  ]);
});
