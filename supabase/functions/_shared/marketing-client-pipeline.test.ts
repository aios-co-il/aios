import { assertEquals } from "jsr:@std/assert@1";
import { findOrCreateClientPipeline } from "./marketing-client-pipeline.ts";

type Pipeline = {
  id: string;
  client_id: string;
  tenant_id: string;
  track: string;
  created_at: string;
};

// marketing_pipelines in memory: filters by eq, sorts by the order calls, takes the limit.
// `lookupError` makes the select fail, as a statement timeout does.
function fakeDb(
  rows: Pipeline[],
  lookupError: { message: string } | null = null,
) {
  const inserted: Record<string, unknown>[] = [];
  const db = {
    from: (table: string) => {
      if (table !== "marketing_pipelines")
        throw new Error(`unexpected ${table}`);
      const filters: Array<(row: Pipeline) => boolean> = [];
      const orders: Array<keyof Pipeline> = [];
      const query = {
        select: () => query,
        eq: (column: keyof Pipeline, value: unknown) => {
          filters.push((row) => row[column] === value);
          return query;
        },
        order: (column: keyof Pipeline) => {
          orders.push(column);
          return query;
        },
        limit: async (n: number) => {
          if (lookupError) return { data: null, error: lookupError };
          const hits = rows
            .filter((row) => filters.every((keep) => keep(row)))
            .sort((a, b) => {
              for (const column of orders) {
                const diff = String(a[column]).localeCompare(String(b[column]));
                if (diff) return diff;
              }
              return 0;
            });
          return {
            data: hits.slice(0, n).map(({ id }) => ({ id })),
            error: null,
          };
        },
        insert: (row: Record<string, unknown>) => {
          inserted.push(row);
          return {
            select: () => ({
              single: async () => ({
                data: { id: "new-pipeline" },
                error: null,
              }),
            }),
          };
        },
      };
      return query;
    },
  };
  return { db, inserted };
}

const pipeline = (
  id: string,
  client_id: string,
  track: string,
  created_at: string,
) => ({
  id,
  client_id,
  tenant_id: "tenant-1",
  track,
  created_at,
});

Deno.test(
  "a failed lookup returns the error and creates no pipeline",
  async () => {
    const { db, inserted } = fakeDb(
      [pipeline("p-1", "client-1", "campaigns", "2026-01-01")],
      { message: "canceling statement due to statement timeout" },
    );
    const result = await findOrCreateClientPipeline(db, {
      clientId: "client-1",
      tenantId: "tenant-1",
      track: "campaigns",
    });
    assertEquals(result, {
      error:
        "לא הצלחנו לקרוא את תהליך העבודה של הלקוח: canceling statement due to statement timeout",
    });
    assertEquals(inserted, []);
  },
);

Deno.test(
  "a client with duplicate pipelines gets the oldest of the track",
  async () => {
    const { db, inserted } = fakeDb([
      pipeline("p-new", "client-1", "campaigns", "2026-03-01"),
      pipeline("p-old", "client-1", "campaigns", "2026-01-01"),
      pipeline("p-seo", "client-1", "seo_geo", "2025-01-01"),
      pipeline("p-other", "client-2", "campaigns", "2025-01-01"),
    ]);
    const result = await findOrCreateClientPipeline(db, {
      clientId: "client-1",
      tenantId: "tenant-1",
      track: "campaigns",
    });
    assertEquals(result, { id: "p-old" });
    assertEquals(inserted, []);
  },
);

Deno.test(
  "a client without a pipeline of the track gets a new one",
  async () => {
    const { db, inserted } = fakeDb([
      pipeline("p-campaigns", "client-1", "campaigns", "2026-01-01"),
    ]);
    const result = await findOrCreateClientPipeline(db, {
      clientId: "client-1",
      tenantId: "tenant-1",
      track: "seo_geo",
    });
    assertEquals(result, { id: "new-pipeline" });
    assertEquals(inserted, [
      { client_id: "client-1", tenant_id: "tenant-1", track: "seo_geo" },
    ]);
  },
);
