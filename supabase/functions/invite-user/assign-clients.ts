import type { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

/** Reads and writes the client assignment needs, injectable for tests. */
export interface ClientAssignmentStore {
  /** Whether this campaigner card belongs to the tenant. */
  campaignerInTenant: (
    tenantId: string,
    campaignerId: string,
  ) => Promise<boolean>;
  /** Of the given ids, those that are clients of this tenant. */
  tenantClientIds: (
    tenantId: string,
    clientIds: Array<string>,
  ) => Promise<Array<string>>;
  /** Of the given ids, clients this campaigner card is on today. */
  assignedClientIds: (
    campaignerId: string,
    clientIds: Array<string>,
  ) => Promise<Array<string>>;
  /** Adds assignments starting today; a row that already exists is kept. */
  insertAssignments: (
    rows: Array<{ client_id: string; campaigner_id: string }>,
  ) => Promise<void>;
}

/** The outcome, so the caller can log or report clients it skipped. */
export interface ClientAssignmentResult {
  assigned: Array<string>;
  alreadyAssigned: Array<string>;
  outsideTenant: Array<string>;
}

/**
 * Puts the invited campaigner's card on the chosen clients' teams
 * (`client_team`), which is what lets a campaigner see a client.
 * Clients outside the inviting tenant are never assigned, and a card from
 * another tenant fails the invite before anything is written.
 */
export async function assignInvitedClients(
  store: ClientAssignmentStore,
  options: {
    tenantId: string;
    campaignerId: string | undefined;
    clientIds: Array<string> | undefined;
  },
): Promise<ClientAssignmentResult> {
  const requested = [...new Set(options.clientIds ?? [])];
  if (!options.campaignerId) {
    return { assigned: [], alreadyAssigned: [], outsideTenant: [] };
  }
  if (
    !(await store.campaignerInTenant(options.tenantId, options.campaignerId))
  ) {
    throw new Error("Campaigner is not in this organization");
  }
  if (requested.length === 0) {
    return { assigned: [], alreadyAssigned: [], outsideTenant: [] };
  }

  const inTenant = await store.tenantClientIds(options.tenantId, requested);
  const outsideTenant = requested.filter((id) => !inTenant.includes(id));
  const alreadyAssigned = await store.assignedClientIds(
    options.campaignerId,
    inTenant,
  );
  const assigned = inTenant.filter((id) => !alreadyAssigned.includes(id));

  if (assigned.length > 0) {
    await store.insertAssignments(
      assigned.map((clientId) => ({
        client_id: clientId,
        campaigner_id: options.campaignerId as string,
      })),
    );
  }
  return { assigned, alreadyAssigned, outsideTenant };
}

/** The Supabase-backed store; every read is scoped by tenant or card id. */
export function supabaseClientAssignmentStore(
  db: ReturnType<typeof createClient>,
): ClientAssignmentStore {
  return {
    async campaignerInTenant(tenantId, campaignerId) {
      const { data, error } = await db
        .from("campaigners")
        .select("id")
        .eq("id", campaignerId)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (error) {
        throw new Error(`Loading the campaigner failed: ${error.message}`);
      }
      return data !== null;
    },
    async tenantClientIds(tenantId, clientIds) {
      const { data, error } = await db
        .from("clients")
        .select("id")
        .eq("tenant_id", tenantId)
        .in("id", clientIds);
      if (error) {
        throw new Error(`Loading invited clients failed: ${error.message}`);
      }
      return (data ?? []).map((row: { id: string }) => row.id);
    },
    // Only assignments current today count: an ended or future row does
    // not let the campaigner see the client now.
    async assignedClientIds(campaignerId, clientIds) {
      if (clientIds.length === 0) {
        return [];
      }
      const today = todayIso();
      const { data, error } = await db
        .from("client_team")
        .select("client_id")
        .eq("campaigner_id", campaignerId)
        .in("client_id", clientIds)
        .or(`start_date.is.null,start_date.lte.${today}`)
        .or(`end_date.is.null,end_date.gte.${today}`);
      if (error) {
        throw new Error(`Loading client teams failed: ${error.message}`);
      }
      return (data ?? []).map((row: { client_id: string }) => row.client_id);
    },
    // start_date is set so the (client_id, campaigner_id, start_date) unique
    // key applies: with a NULL start_date, two concurrent invites would both insert.
    async insertAssignments(rows) {
      const start_date = todayIso();
      const { error } = await db.from("client_team").upsert(
        rows.map((row) => ({ ...row, start_date })),
        {
          onConflict: "client_id,campaigner_id,start_date",
          ignoreDuplicates: true,
        },
      );
      if (error) {
        throw new Error(`Assigning invited clients failed: ${error.message}`);
      }
    },
  };
}

/** Today's date (UTC) as YYYY-MM-DD, the format of client_team dates. */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
