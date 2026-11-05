/**
 * The organizations of the carmen-brain-connections tests, as
 * 20261105120000_carmen_brain_home_marketingcaptain leaves them (AIO-354):
 * MarketingCaptain is the home tenant and shares every built-in brain with
 * DMM; Client gets nothing. The super admin belongs to MarketingCaptain and
 * DMM but not to Client; MarketingCaptain's other owner is no super admin
 * and belongs to Client as a member.
 */
import { BUILTIN_BRAIN_KEYS } from "../_shared/carmen/brain-connections/builtin-keys.ts";
import type { FakeWorld } from "./fake-db.ts";

// Uuids, since the super admin lookup ignores any other id.
export const MC = "00000000-0000-4000-8000-0000000000c1";
export const DMM = "00000000-0000-4000-8000-0000000000c2";
export const CLIENT = "00000000-0000-4000-8000-0000000000c3";

export const SUPER_ADMIN = "00000000-0000-4000-8000-0000000000a1";
export const MC_OWNER = "00000000-0000-4000-8000-0000000000a2";
export const DMM_OWNER = "00000000-0000-4000-8000-0000000000a3";
export const CLIENT_OWNER = "00000000-0000-4000-8000-0000000000a4";

/** A project env with every built-in brain's id and key. */
export const PROJECT: Record<string, string> = Object.fromEntries(
  BUILTIN_BRAIN_KEYS.flatMap((spec) =>
    spec.envNames.map((name) => [name, `project-${name.toLowerCase()}`]),
  ),
);

export function homeWorld(): FakeWorld {
  return {
    superAdmins: [SUPER_ADMIN],
    tables: {
      tenants: [
        { id: MC, name: "MarketingCaptain" },
        { id: DMM, name: "DMM" },
        { id: CLIENT, name: "Client" },
      ],
      tenant_users: [
        { tenant_id: MC, user_id: SUPER_ADMIN, role: "owner" },
        { tenant_id: DMM, user_id: SUPER_ADMIN, role: "owner" },
        { tenant_id: MC, user_id: MC_OWNER, role: "owner" },
        { tenant_id: CLIENT, user_id: MC_OWNER, role: "member" },
        { tenant_id: DMM, user_id: DMM_OWNER, role: "owner" },
        { tenant_id: CLIENT, user_id: CLIENT_OWNER, role: "owner" },
      ],
      carmen_brain_home_tenants: [{ tenant_id: MC }],
      carmen_brain_key_shares: BUILTIN_BRAIN_KEYS.map((spec) => ({
        source_tenant_id: MC,
        target_tenant_id: DMM,
        builtin_slug: spec.slug,
        granted_by: null,
      })),
      carmen_brain_connections: [],
    },
  };
}
