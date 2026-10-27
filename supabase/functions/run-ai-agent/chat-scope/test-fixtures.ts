// Shared ids, scopes and the fake tenant for the chat-scope tests.
import { fakeDb } from "./fake-db.ts";
import type { ChatScope } from "./types.ts";

export const T = "10000000-0000-4000-8000-000000000001";
export const T2 = "10000000-0000-4000-8000-000000000002";
export const DAVID = "d0000000-0000-4000-8000-00000000000d";
export const DANA = "d0000000-0000-4000-8000-0000000000a1";
export const RONIT = "d0000000-0000-4000-8000-0000000000a2";
export const AG_OWNER = "d0000000-0000-4000-8000-0000000000a3";
export const TEAM_MGR = "d0000000-0000-4000-8000-0000000000a4";
export const MAYA = "d0000000-0000-4000-8000-0000000000a5";
export const DANA_CAMP = "c1000000-0000-4000-8000-0000000000a1";
export const RONIT_CAMP = "c1000000-0000-4000-8000-0000000000a2";
export const MAYA_CAMP = "c1000000-0000-4000-8000-0000000000a5";
export const ORG_LINE = "d0000000-0000-4000-8000-0000000000f1";
export const MANUS = "d0000000-0000-4000-8000-0000000000e1";
export const AG1 = "a0000000-0000-4000-8000-000000000001";
export const AG2 = "a0000000-0000-4000-8000-000000000002";
export const CA = "c0000000-0000-4000-8000-00000000000a";
export const CB = "c0000000-0000-4000-8000-00000000000b";
export const CC = "c0000000-0000-4000-8000-00000000000c";
export const GA = "f0000000-0000-4000-8000-00000000000a";
export const GB = "f0000000-0000-4000-8000-00000000000b";
export const GC = "f0000000-0000-4000-8000-00000000000c";
export const GFAM = "f0000000-0000-4000-8000-0000000000ff";
export const L1 = "b0000000-0000-4000-8000-000000000001";
export const L2 = "b0000000-0000-4000-8000-000000000002";
export const SP = "5a000000-0000-4000-8000-000000000001";

export type Row = Record<string, unknown>;

/** The resolveChatScope input fields every test shares. */
export const base = {
  tenantId: T,
  accessibleTenantIds: [T],
  today: "2026-10-26",
};

/** Dana's staff scope (client A, group A, own and org lines), with overrides. */
export function staff(over: Partial<ChatScope> = {}): ChatScope {
  return {
    mode: "staff",
    reason: null,
    groupId: null,
    connectionUserIds: [DANA, ORG_LINE],
    clientIds: [CA],
    leads: { all: false, agencyIds: [], salesPersonId: null },
    linkedGroupIds: [GA],
    ownThread: null,
    ...over,
  };
}

/** A user_roles row; tenant null is a global role. */
export function role(
  user_id: string,
  r: string,
  tenant_id: string | null = T,
): Row {
  return { user_id, role: r, tenant_id };
}

/**
 * Tenant T: clients A (group A) and B (Carmen group B) of agency 1, client C
 * of agency 2 whose assignment ended, leads 1 (agency 1) and 2 (salesperson
 * SP). Dana may read her own and the org line; others only their own.
 */
export function world(
  over: Record<string, Row[]> = {},
  rpcs: Record<string, (args: Row) => unknown> = {
    chat_allowed_connection_user_ids: (args) =>
      args.p_user_id === DANA ? [DANA, ORG_LINE] : [args.p_user_id],
  },
) {
  return fakeDb(
    {
      user_roles: [],
      user_managed_agencies: [],
      whatsapp_groups: [
        { id: GA, tenant_id: T, group_chat_id: "120363-a@g.us" },
      ],
      profiles: [
        { id: DANA, campaigner_id: DANA_CAMP, sales_person_id: null },
        { id: DAVID, campaigner_id: null, sales_person_id: SP },
      ],
      client_team: [
        { campaigner_id: DANA_CAMP, client_id: CA, start_date: "2026-01-01" },
        { campaigner_id: DANA_CAMP, client_id: CC, end_date: "2026-09-30" },
      ],
      clients: [
        { id: CA, tenant_id: T, agency_id: AG1, whatsapp_group_id: GA },
        { id: CB, tenant_id: T, agency_id: AG1, whatsapp_group_id: null },
        { id: CC, tenant_id: T, agency_id: AG2, whatsapp_group_id: GC },
      ],
      team_channel_whatsapp_links: [],
      carmen_client_group_access: [
        { tenant_id: T, client_id: CB, whatsapp_group_id: GB },
      ],
      leads: [
        { id: L1, tenant_id: T, agency_id: AG1, sales_person_id: null },
        { id: L2, tenant_id: T, agency_id: AG2, sales_person_id: SP },
      ],
      ...over,
    },
    rpcs,
  );
}
