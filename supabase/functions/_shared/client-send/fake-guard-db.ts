// In-memory Supabase for the client send guard's tests. guardDb returns a
// real typed client over a fake fetch, so the guard's queries type-check as
// they do in production: the fetch answers the guard's RPCs and eq-filtered
// reads of fixture tables, and records inserts in `writes` without applying
// them. serviceClient() cannot be used: it reads the env and the global fetch.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { isRecord } from "../client-card/is-record.ts";
import type { Database } from "../database.types.ts";
import type { DbClient } from "../supabase-clients.ts";
import type { RecipientKind } from "./types.ts";

export const TENANT = "11111111-1111-4111-8111-111111111111";
export const OTHER_TENANT = "22222222-2222-4222-8222-222222222222";
export const CLIENT = "33333333-3333-4333-8333-333333333333";
export const OTHER_CLIENT = "44444444-4444-4444-8444-444444444444";

type Row = Record<string, unknown>;

/** One row of resolve_send_recipient. */
export type ResolverRow = {
  recipient_kind: RecipientKind;
  client_ids: string[];
  lead_id: string | null;
  group_id: string | null;
  ambiguous: boolean;
  sender_staff: boolean;
};

/** An insert the fake received. */
export type FakeWrite = { table: string; values: unknown };

/** An RPC the fake answered, with its JSON arguments. */
export type FakeRpcCall = { fn: string; args: Row };

const FAKE_URL = "http://guard-db.test";

/** The resolver's row for a recipient of this kind and these clients. */
export function resolved(
  kind: RecipientKind,
  clientIds: string[] = [],
  extra: Partial<ResolverRow> = {},
): ResolverRow {
  return {
    recipient_kind: kind,
    client_ids: clientIds,
    lead_id: null,
    group_id: null,
    ambiguous: false,
    sender_staff: false,
    ...extra,
  };
}

/** The key of a switch that is on: client, kind and target. */
export const optInKey = (client: string, kind: string, target: string) =>
  `${client}:${kind}:${target}`;

/**
 * A fake database. resolve_send_recipient answers `recipient` (unknown by
 * default; null answers no row), client_auto_send_allowed is true for the
 * `optIns` keys, broadcast_lists_recipient finds `broadcast_recipients` rows
 * by broadcast, tenant and `address` or `group_id`. A table or RPC named in
 * `failing` answers a database error; `offline` fails every request.
 */
export function guardDb(
  input: {
    recipient?: Row | null;
    optIns?: string[];
    tables?: Record<string, Row[]>;
    failing?: string[];
    offline?: boolean;
  } = {},
) {
  const writes: FakeWrite[] = [];
  const rpcCalls: FakeRpcCall[] = [];
  const rpcs: Record<string, (args: Row) => unknown> = {
    resolve_send_recipient: () =>
      input.recipient === null ? [] : [input.recipient ?? resolved("unknown")],
    client_auto_send_allowed: (args) =>
      (input.optIns ?? []).includes(
        optInKey(
          String(args.p_client_id),
          String(args.p_kind),
          String(args.p_target),
        ),
      ),
    broadcast_lists_recipient: (args) =>
      (input.tables?.broadcast_recipients ?? []).some(
        (row) =>
          row.broadcast_id === args.p_broadcast_id &&
          row.tenant_id === args.p_tenant_id &&
          (row.address === args.p_address ||
            (args.p_group_id !== undefined &&
              row.group_id === args.p_group_id)),
      ),
  };

  /** PostgREST's answer to one request. */
  async function answer(request: Request): Promise<Response> {
    if (input.offline) {
      throw new TypeError("fetch failed");
    }
    const url = new URL(request.url);
    const name = url.pathname.replace(/^\/rest\/v1\/(rpc\/)?/, "");
    const body: unknown =
      request.method === "POST" ? await request.json() : null;
    if ((input.failing ?? []).includes(name)) {
      return jsonResponse({ message: `${name} failed`, code: "XX000" }, 500);
    }
    if (url.pathname.startsWith("/rest/v1/rpc/")) {
      const rpc = rpcs[name];
      if (!rpc || !isRecord(body)) {
        return jsonResponse({ message: `no fake for ${name}` }, 404);
      }
      rpcCalls.push({ fn: name, args: body });
      return pgrstAnswer(request, rpc(body));
    }
    if (request.method === "POST") {
      writes.push({ table: name, values: body });
      return new Response(null, { status: 201 });
    }
    return pgrstAnswer(
      request,
      selectRows(input.tables?.[name] ?? [], url.searchParams),
    );
  }

  const db: DbClient = createClient<Database>(FAKE_URL, "service-role-key", {
    global: { fetch: (resource, init) => answer(new Request(resource, init)) },
    auth: { persistSession: false },
  });
  return { db, writes, rpcCalls };
}

/** The refusal rows a fake database received. */
export function refusalRows(writes: FakeWrite[]): Row[] {
  return writes
    .filter((write) => write.table === "client_send_refusals")
    .map((write) => write.values)
    .filter(isRecord);
}

/** The rows that pass every `column=eq.value` filter, ordered and limited. */
function selectRows(rows: Row[], params: URLSearchParams): Row[] {
  const filters = [...params].filter(([, value]) => value.startsWith("eq."));
  let selected = rows.filter((row) =>
    filters.every(([column, value]) => String(row[column]) === value.slice(3)),
  );
  const order = params.get("order");
  if (order) {
    const [column, direction] = order.split(".");
    const sign = direction === "desc" ? -1 : 1;
    selected = [...selected].sort(
      (a, b) => String(a[column]).localeCompare(String(b[column])) * sign,
    );
  }
  const limit = params.get("limit");
  return limit ? selected.slice(0, Number(limit)) : selected;
}

/**
 * The JSON answer, as one object when the client asked for one: .single()
 * of no row is PostgREST's 406.
 */
function pgrstAnswer(request: Request, data: unknown): Response {
  const wantsObject = (request.headers.get("Accept") ?? "").includes(
    "vnd.pgrst.object",
  );
  if (!wantsObject || !Array.isArray(data)) {
    return jsonResponse(data, 200);
  }
  return data.length === 1
    ? jsonResponse(data[0], 200)
    : jsonResponse({ message: "no single row", code: "PGRST116" }, 406);
}

/** A JSON response with this status. */
function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
