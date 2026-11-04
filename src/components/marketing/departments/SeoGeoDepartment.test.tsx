import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { createTestQueryHarness } from "@/test/withTestQuery";
import { SeoGeoDepartment } from "./SeoGeoDepartment";
import { ALL_CLIENTS_FILTER } from "../clientFilter";

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
    wrapper: createTestQueryHarness().wrapper,
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

describe("validated SEO strategy rendering", () => {
  test.each([false, true])(
    "isolates malformed rows in all-clients queries (all invalid: %s)",
    async (allInvalid) => {
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      db.tables.marketing_work_items.push({
        id: "broken-item",
        tenant_id: "tenant-1",
        client_id: "client-2",
        title: "Broken project",
        status: "active",
        current_stage_id: null,
        payload: {
          department: "seo",
          seo_plan: { strategy: { objective: 7 } },
        },
      });
      if (allInvalid) {
        db.tables.marketing_work_items.shift();
      }
      render(
        <SeoGeoDepartment
          clientFilter={ALL_CLIENTS_FILTER}
          tenantId="tenant-1"
        />,
        { wrapper: createTestQueryHarness().wrapper },
      );
      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent("Broken project");
      expect(alert).toHaveTextContent("broken-item");
      expect(screen.queryByText("אין תוכניות עדיין")).not.toBeInTheDocument();
      if (!allInvalid) {
        expect(
          await screen.findByRole("button", { name: /קידום האתר/ }),
        ).toBeInTheDocument();
      }
      expect(log).toHaveBeenCalledWith(
        "Invalid SEO project",
        "broken-item",
        expect.any(Error),
      );
      log.mockRestore();
    },
  );

  test("renders only named strategy fields when stored metadata contains an object", async () => {
    db.tables.marketing_work_items[0].payload = {
      department: "seo",
      seo_plan: {
        strategy: { objective: "Known objective", provider: { model: "x" } },
        contentPlan: [{ title: "Article" }],
      },
    };
    renderScreen();
    const strategy = await screen.findByRole("tab", {
      name: "אסטרטגיה",
    });
    fireEvent.mouseDown(strategy, { button: 0, ctrlKey: false });
    const tab = await screen.findByRole("tab", { name: "אסטרטגיה ו-GEO" });
    fireEvent.mouseDown(tab, { button: 0, ctrlKey: false });
    expect(await screen.findByText("Known objective")).toBeInTheDocument();
    expect(screen.queryByText("provider")).not.toBeInTheDocument();
  });
});
