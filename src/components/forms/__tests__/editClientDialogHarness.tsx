import { waitFor } from "@testing-library/react";
import { expect, vi } from "vitest";

/**
 * Shared fake state and helpers for the EditClientDialog tests. The test
 * file's vi.mock factories read from here, so a test and the mocked modules
 * see the same objects.
 */

export type Write = {
  table: string;
  op: string;
  payload?: unknown;
  options?: unknown;
};

export const db = {
  access: { read: false, write: false },
  accessError: null as null | { message: string },
  financialRow: null as null | { retainer: number; monthly_budget: number },
  writes: [] as Array<Write>,
  rpcCalls: [] as Array<{ name: string; args: unknown }>,
  adLinks: null as null | {
    google_ads_url: string | null;
    meta_ads_url: string | null;
  },
};

export const role = {
  isOwner: false,
  isSuperAdmin: false,
  isCampaigner: false,
  isTeamManager: false,
  isAgencyOwner: false,
  userId: "user-1",
};

export const toast = {
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
};

export const client = {
  id: "client-1",
  name: "לקוח בדיקה",
  agency_id: "agency-1",
  status: "active" as const,
  retainer: null,
  monthly_budget: null,
};

/** Clears the recorded writes and the fake database before each test. */
export function resetHarness() {
  db.access = { read: false, write: false };
  db.accessError = null;
  db.financialRow = null;
  db.writes = [];
  db.rpcCalls = [];
  db.adLinks = null;
}

/** Sets the caller's role flags and finance access. */
export function setPersona(
  flags: Partial<typeof role>,
  access: { read: boolean; write: boolean },
) {
  Object.assign(role, {
    isOwner: false,
    isSuperAdmin: false,
    isTeamManager: false,
    isAgencyOwner: false,
    ...flags,
  });
  db.access = access;
}

/** Waits until both finance permission checks have run. */
export async function waitForFinanceAccess() {
  await waitFor(() => expect(db.rpcCalls).toHaveLength(2));
}

/** The recorded writes to one table. */
export function writesTo(table: string) {
  return db.writes.filter((write) => write.table === table);
}

/** A Supabase client stand-in that records writes and answers from `db`. */
export function supabaseModule() {
  /** What the database returns for one finished query. */
  const resultFor = (table: string, op: string, single: boolean) => {
    if (table === "clients" && op === "update") {
      return { data: [{ id: "client-1" }], error: null };
    }
    if (table === "clients" && op === "select" && single) {
      return { data: db.adLinks, error: null };
    }
    if (table === "client_tenant_financial_data" && op === "select") {
      return { data: db.financialRow, error: null };
    }
    return { data: single || op !== "select" ? null : [], error: null };
  };

  /** A chainable PostgREST stand-in that records writes and resolves when awaited. */
  const from = (table: string) => {
    let op = "select";
    let single = false;
    const builder: Record<string, unknown> = {};
    const chain = () => builder;
    for (const name of ["select", "eq", "in", "not", "is", "or", "order"]) {
      builder[name] = chain;
    }
    for (const kind of ["insert", "update", "upsert", "delete"]) {
      builder[kind] = (payload?: unknown, options?: unknown) => {
        op = kind;
        db.writes.push({ table, op: kind, payload, options });
        return builder;
      };
    }
    builder.maybeSingle = () => {
      single = true;
      return builder;
    };
    builder.then = (
      resolve: (value: unknown) => unknown,
      reject: (reason: unknown) => unknown,
    ) => Promise.resolve(resultFor(table, op, single)).then(resolve, reject);
    return builder;
  };

  const rpc = async (name: string, args: unknown) => {
    db.rpcCalls.push({ name, args });
    if (db.accessError) {
      return { data: null, error: db.accessError };
    }
    const allowed =
      name === "has_finance_write_permission"
        ? db.access.write
        : db.access.read;
    return { data: allowed, error: null };
  };

  return { supabase: { from, rpc } };
}
