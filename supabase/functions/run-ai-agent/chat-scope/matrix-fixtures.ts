// A tenant with David (owner) on his private Green API line, an org-wide Green
// line, Carmen's Manus line, campaigner Dana (client A), campaigner Ronit
// (client B), an agency owner, a team manager of agency 1, Maya (owner of
// another tenant, campaigner of client A here), and a client contact who talks
// to Carmen in client A's group.
import type { Row } from "./fake-db-filter.ts";
import {
  AG1,
  AG_OWNER,
  CA,
  CB,
  DANA,
  DANA_CAMP,
  DAVID,
  GA,
  GB,
  GFAM,
  L1,
  MANUS,
  MAYA,
  MAYA_CAMP,
  ORG_LINE,
  RONIT,
  RONIT_CAMP,
  T,
  T2,
  TEAM_MGR,
  world,
} from "./test-fixtures.ts";

export const DANA_PHONE = "972501111111";
export const DAVID_PHONE = "972509999999";
export const MAYA_PHONE = "972502222222";

const integrations = [
  { tenant_id: T, user_id: DAVID, connection_visibility: "private" },
  { tenant_id: T, user_id: ORG_LINE, connection_visibility: "org" },
  { tenant_id: T, user_id: MANUS, connection_visibility: "private" },
];

let minute = 0;

/** Every chat_messages row of the matrix, oldest first. */
export const messages = [
  msg("a-dm-on-david-green", "green_api", DAVID, "972500000001", CA),
  msg("a-dm-on-org-green", "green_api", ORG_LINE, "972500000001", CA),
  msg("b-dm-on-org-green", "green_api", ORG_LINE, "972500000002", CB),
  msg("a-group-on-manus", "manus_wa", MANUS, "972500000011", null, GA),
  msg("a-group-on-david-green", "green_api", DAVID, "972500000011", null, GA),
  msg("b-group-on-manus", "manus_wa", MANUS, "972500000012", null, GB),
  msg("david-private-dm", "green_api", DAVID, "972544444444"),
  msg("david-family-group", "green_api", DAVID, "972544444445", null, GFAM),
  msg("dana-chat-with-carmen", "manus_wa", MANUS, DANA_PHONE),
  msg("david-chat-with-carmen", "manus_wa", MANUS, DAVID_PHONE),
  {
    ...msg("lead-dm-on-org-green", "green_api", ORG_LINE, "972500000021"),
    lead_id: L1,
  },
  {
    ...msg("other-tenant", "manus_wa", MANUS, "972500000031"),
    tenant_id: T2,
  },
];

// user_roles is per tenant. run-ai-agent's callerRole is the highest role
// across every tenant, so Maya would count as an owner there.
const userRoles = [
  { user_id: DAVID, role: "owner", tenant_id: T },
  { user_id: DANA, role: "campaigner", tenant_id: T },
  { user_id: RONIT, role: "campaigner", tenant_id: T },
  { user_id: AG_OWNER, role: "agency_owner", tenant_id: T },
  { user_id: TEAM_MGR, role: "team_manager", tenant_id: T },
  { user_id: MAYA, role: "owner", tenant_id: T2 },
  { user_id: MAYA, role: "agency_owner", tenant_id: T2 },
  { user_id: MAYA, role: "campaigner", tenant_id: T },
];

/** The matrix tenant as a fake client. */
export function matrixWorld() {
  return world(
    {
      chat_messages: messages,
      user_roles: userRoles,
      user_managed_agencies: [
        { user_id: TEAM_MGR, agency_id: AG1 },
        { user_id: MAYA, agency_id: AG1 },
      ],
      whatsapp_groups: [
        { id: GA, tenant_id: T, group_chat_id: "120363-a@g.us" },
        { id: GB, tenant_id: T, group_chat_id: "120363-b@g.us" },
        { id: GFAM, tenant_id: T, group_chat_id: "120363-family@g.us" },
      ],
      profiles: [
        { id: DANA, campaigner_id: DANA_CAMP },
        { id: RONIT, campaigner_id: RONIT_CAMP },
        { id: AG_OWNER, campaigner_id: null },
        { id: TEAM_MGR, campaigner_id: null },
        { id: MAYA, campaigner_id: MAYA_CAMP },
      ],
      client_team: [
        { campaigner_id: DANA_CAMP, client_id: CA, start_date: "2026-01-01" },
        { campaigner_id: MAYA_CAMP, client_id: CA, start_date: "2026-01-01" },
        { campaigner_id: RONIT_CAMP, client_id: CB, start_date: "2026-01-01" },
      ],
      clients: [
        { id: CA, tenant_id: T, agency_id: AG1, whatsapp_group_id: GA },
        { id: CB, tenant_id: T, agency_id: AG1, whatsapp_group_id: null },
      ],
      leads: [{ id: L1, tenant_id: T, agency_id: AG1, sales_person_id: null }],
    },
    { chat_allowed_connection_user_ids: allowedConnections },
  );
}

/**
 * The get_chat_contacts rule (own + org + explicitly shared; super admin all),
 * as chat_allowed_connection_user_ids returns it. The SQL itself is checked by
 * carmen-chat-scope-connections.sql.test.ts and
 * supabase/tests/carmen_chat_scope_connections.sql.
 */
function allowedConnections({ p_tenant_id, p_user_id }: Row): unknown[] {
  const owners = new Set([p_user_id]);
  for (const ti of integrations) {
    if (
      ti.tenant_id === p_tenant_id &&
      (ti.user_id === p_user_id || ti.connection_visibility === "org")
    ) {
      owners.add(ti.user_id);
    }
  }

  return [...owners];
}

/** An inbound message in tenant T, one minute after the previous one. */
function msg(
  id: string,
  provider: string,
  line: string,
  phone: string,
  client: string | null = null,
  group: string | null = null,
): Row {
  minute += 1;
  return {
    id,
    tenant_id: T,
    direction: "inbound",
    message_text: `תקציב ${id}`,
    created_at: `2026-10-26T08:${String(minute).padStart(2, "0")}:00Z`,
    client_id: client,
    lead_id: null,
    group_id: group,
    sender_name: id,
    provider,
    connection_user_id: line,
    sender_phone: phone,
  };
}
