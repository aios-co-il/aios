import type { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

/** Reads and writes the client assignment needs, injectable for tests. */
export interface ClientAssignmentStore {
  /** Of the given ids, those that are clients of this tenant. */
  tenantClientIds: (
    tenantId: string,
    clientIds: Array<string>,
  ) => Promise<Array<string>>;
  /** Of the given ids, clients this campaigner card is already on. */
  assignedClientIds: (
    campaignerId: string,
    clientIds: Array<string>,
  ) => Promise<Array<string>>;
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
 * Clients outside the inviting tenant are never assigned.
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
  if (!options.campaignerId || requested.length === 0) {
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
    async assignedClientIds(campaignerId, clientIds) {
      if (clientIds.length === 0) {
        return [];
      }
      const { data, error } = await db
        .from("client_team")
        .select("client_id")
        .eq("campaigner_id", campaignerId)
        .in("client_id", clientIds);
      if (error) {
        throw new Error(`Loading client teams failed: ${error.message}`);
      }
      return (data ?? []).map((row: { client_id: string }) => row.client_id);
    },
    // Select-then-insert: the unique key includes a nullable start_date, so an
    // upsert on it would not dedupe rows whose start_date is null.
    async insertAssignments(rows) {
      const { error } = await db.from("client_team").insert(rows);
      if (error) {
        throw new Error(`Assigning invited clients failed: ${error.message}`);
      }
    },
  };
}
