import type { Database, Tables } from "../../_shared/database.types.ts";

type ClaimRefreshRpc =
  Database["public"]["Functions"]["claim_campaign_pulse_refresh"];

/** A filtered read that resolves to at most one row. */
type RefreshRead<Row> = {
  eq(column: string, value: string): RefreshRead<Row>;
  in(column: string, values: string[]): RefreshRead<Row>;
  order(column: string, options: { ascending: boolean }): RefreshRead<Row>;
  limit(count: number): RefreshRead<Row>;
  maybeSingle(): PromiseLike<{ data: Row | null; error: unknown }>;
};

/**
 * The two reads and the claim RPC these deps run, with rows and RPC arguments
 * from the generated schema. Narrower than DbClient so the Deno tests' fakes
 * fit it without casts.
 */
export type RefreshClient = {
  from(table: "clients"): {
    select(columns: "id"): RefreshRead<Pick<Tables<"clients">, "id">>;
  };
  from(table: "campaign_pulse_snapshots"): {
    select(
      columns: "calculated_at",
    ): RefreshRead<Pick<Tables<"campaign_pulse_snapshots">, "calculated_at">>;
  };
  rpc(
    fn: "claim_campaign_pulse_refresh",
    args: ClaimRefreshRpc["Args"],
  ): PromiseLike<{ data: ClaimRefreshRpc["Returns"] | null; error: unknown }>;
};
