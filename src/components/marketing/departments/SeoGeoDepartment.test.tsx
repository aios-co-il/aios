import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { withTestQuery } from "@/test/withTestQuery";
import { SeoGeoDepartment } from "./SeoGeoDepartment";

type Row = Record<string, unknown>;

// An in-memory PostgREST: filters by eq / is / in, and returns only the columns a query selects,
// so a screen that leaves a column out of its select does not get it.
const db = vi.hoisted(() => {
  const tables: Record<string, Record<string, unknown>[]> = {};
  const from = (table: string) => {
    const filters: Array<(row: Record<string, unknown>) => boolean> = [];
    let columns: string[] | null = null;
    let head = false;
    let insert: Record<string, unknown> | null = null;
    let patch: Record<string, unknown> | null = null;
    const run = () => {
      const rows = (tables[table] ??= []);
      if (insert) rows.push({ id: `${table}-${rows.length + 1}`, ...insert });
      const hits = insert
        ? rows.slice(-1)
        : rows.filter((row) => filters.every((keep) => keep(row)));
      if (patch) for (const row of hits) Object.assign(row, patch);
      const data = hits.map((row) =>
        columns
          ? Object.fromEntries(columns.map((column) => [column, row[column]]))
          : { ...row },
      );
      return head
        ? { data: null, count: data.length, error: null }
        : { data, count: data.length, error: null };
    };
    const query = {
      select: (list = "*", options?: { head?: boolean }) => {
        columns =
          list === "*" ? null : list.split(",").map((part) => part.trim());
        head = !!options?.head;
        return query;
      },
      insert: (row: Record<string, unknown>) => {
        insert = row;
        return query;
      },
      update: (values: Record<string, unknown>) => {
        patch = values;
        return query;
      },
      eq: (column: string, value: unknown) => {
        filters.push((row) => row[column] === value);
        return query;
      },
      is: (column: string, value: unknown) => {
        filters.push((row) => (row[column] ?? null) === value);
        return query;
      },
      in: (column: string, values: unknown[]) => {
        filters.push((row) => values.includes(row[column]));
        return query;
      },
      gte: () => query,
      order: () => query,
      maybeSingle: async () => ({ data: run().data?.[0] ?? null, error: null }),
      single: async () => ({ data: run().data?.[0] ?? null, error: null }),
      then: (
        resolve: (value: unknown) => unknown,
        reject?: (reason: unknown) => unknown,
      ) => Promise.resolve(run()).then(resolve, reject),
    };
    return query;
  };
  return { tables, from };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: db.from, functions: { invoke: vi.fn() } },
}));
vi.mock("@/lib/seoGeoDb", () => ({ seoGeoDb: { from: db.from } }));
vi.mock("@/components/marketing/lib/ensurePipeline", () => ({
  ensurePipelineForClient: async () => ({ id: "pipeline-seo-1" }),
}));

beforeEach(() => {
  HTMLElement.prototype.hasPointerCapture = () => false;
  HTMLElement.prototype.scrollIntoView = () => {};
  for (const table of Object.keys(db.tables)) delete db.tables[table];
  Object.assign(db.tables, {
    marketing_pipeline_stages: [
      {
        id: "stage-seo-1",
        pipeline_id: "pipeline-seo-1",
        stage_type: "target_seo",
      },
    ],
    marketing_work_items: [
      {
        id: "item-1",
        tenant_id: "tenant-1",
        client_id: "client-1",
        title: "קידום האתר",
        status: "active",
        payload: { department: "seo" },
        current_stage_id: "stage-seo-1",
        updated_at: "2026-10-01T00:00:00Z",
      },
    ],
    seo_geo_programs: [],
    social_media_wordpress_sites: [
      {
        id: "site-1",
        tenant_id: "tenant-1",
        client_id: "client-1",
        site_url: "https://one.example",
        site_name: "הבלוג של לקוח 1",
      },
      {
        id: "site-2",
        tenant_id: "tenant-1",
        client_id: "client-2",
        site_url: "https://two.example",
        site_name: "הבלוג של לקוח 2",
      },
    ],
  });
});

const renderScreen = () =>
  render(<SeoGeoDepartment clientFilter="client-1" tenantId="tenant-1" />, {
    wrapper: withTestQuery().wrapper,
  });

test("a project of the open client gets its program settings and its client's sites", async () => {
  renderScreen();
  // The program query has settled once the auto-approve switch is enabled.
  await waitFor(() => expect(screen.getByRole("switch")).toBeEnabled());
  expect(
    screen.queryByText("שייכו את הפרויקט ללקוח כדי להגדיר תוכנית"),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByText("הפרויקט הזה שייך ללקוח אחר"),
  ).not.toBeInTheDocument();

  fireEvent.keyDown(screen.getByRole("combobox"), { key: "ArrowDown" });
  expect(
    await screen.findByRole("option", { name: "הבלוג של לקוח 1" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("option", { name: "הבלוג של לקוח 2" }),
  ).not.toBeInTheDocument();
});

test("a project's existing program shows the site it publishes to", async () => {
  db.tables.seo_geo_programs.push({
    id: "program-1",
    tenant_id: "tenant-1",
    client_id: "client-1",
    work_item_id: "item-1",
    wordpress_site_id: "site-1",
    auto_approve: false,
  });
  renderScreen();
  await waitFor(() => expect(screen.getByRole("switch")).toBeEnabled());
  await waitFor(() =>
    expect(screen.getByRole("combobox")).toHaveTextContent("הבלוג של לקוח 1"),
  );
});
