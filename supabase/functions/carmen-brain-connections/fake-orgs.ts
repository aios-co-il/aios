/**
 * The organizations of the carmen-brain-connections tests, as
 * 20261105120000_carmen_brain_home_marketingcaptain leaves them (AIO-354):
 * MarketingCaptain is the home tenant and shares every built-in brain with
 * DMM; Client has its own Claude key; Other has nothing. Each tenant has an
 * owner. The super admin owns MarketingCaptain and DMM, belongs to neither
 * Client nor Other, and acts in MarketingCaptain unless a test moves them.
 * MarketingCaptain's other owner is no super admin and belongs to Client as
 * a member.
 */
import { BUILTIN_BRAIN_KEYS } from "../_shared/carmen/brain-connections/builtin-keys.ts";
import {
  fakeDb,
  type FakeWorld,
} from "../_shared/carmen/brain-connections/fake-db.ts";
import { requireManager } from "./auth.ts";
import type { ActionContext } from "./request.ts";

export const MC = "00000000-0000-4000-8000-0000000000c1";
export const DMM = "00000000-0000-4000-8000-0000000000c2";
export const CLIENT = "00000000-0000-4000-8000-0000000000c3";
export const OTHER = "00000000-0000-4000-8000-0000000000c4";

export const SUPER_ADMIN = "00000000-0000-4000-8000-0000000000a1";
export const MC_OWNER = "00000000-0000-4000-8000-0000000000a2";
export const DMM_OWNER = "00000000-0000-4000-8000-0000000000a3";
export const CLIENT_OWNER = "00000000-0000-4000-8000-0000000000a4";
export const OTHER_OWNER = "00000000-0000-4000-8000-0000000000a5";

/** A project env with every built-in brain's id and key. */
export const PROJECT: Record<string, string> = Object.fromEntries(
  BUILTIN_BRAIN_KEYS.flatMap((spec) =>
    spec.envNames.map((name) => [name, `project-${name.toLowerCase()}`]),
  ),
);

/** The organizations above, with every user acting in their own tenant. */
export function homeWorld(): FakeWorld {
  return {
    acting: {
      [SUPER_ADMIN]: MC,
      [MC_OWNER]: MC,
      [DMM_OWNER]: DMM,
      [CLIENT_OWNER]: CLIENT,
      [OTHER_OWNER]: OTHER,
    },
    secrets: { "client-claude": "client-claude-token" },
    tables: {
      tenants: [
        { id: MC, name: "MarketingCaptain" },
        { id: DMM, name: "DMM" },
        { id: CLIENT, name: "Client" },
        { id: OTHER, name: "Other" },
      ],
      user_roles: [
        { user_id: SUPER_ADMIN, role: "super_admin", tenant_id: null },
      ],
      tenant_users: [
        { tenant_id: MC, user_id: SUPER_ADMIN, role: "owner" },
        { tenant_id: DMM, user_id: SUPER_ADMIN, role: "owner" },
        { tenant_id: MC, user_id: MC_OWNER, role: "owner" },
        { tenant_id: CLIENT, user_id: MC_OWNER, role: "member" },
        { tenant_id: DMM, user_id: DMM_OWNER, role: "owner" },
        { tenant_id: CLIENT, user_id: CLIENT_OWNER, role: "owner" },
        { tenant_id: OTHER, user_id: OTHER_OWNER, role: "owner" },
      ],
      carmen_brain_home_tenants: [{ tenant_id: MC }],
      carmen_brain_key_shares: BUILTIN_BRAIN_KEYS.map((spec) => ({
        source_tenant_id: MC,
        target_tenant_id: DMM,
        builtin_slug: spec.slug,
        granted_by: null,
      })),
      carmen_brain_connections: [
        {
          id: "client-claude",
          tenant_id: CLIENT,
          slug: "claude",
          kind: "builtin",
          settings: { external_id: "client-routine" },
          secret_id: "vault-client-claude",
        },
      ],
    },
  };
}

/** The context index.ts builds for `userId` in `tenantId`, through its gate. */
export async function fakeCtx(
  world: FakeWorld,
  tenantId: string,
  userId: string,
  body: Record<string, unknown> = {},
): Promise<ActionContext> {
  const sb = fakeDb(world);
  const { superAdminActing } = await requireManager(sb, userId, tenantId);
  return { sb, tenantId, agentId: null, userId, body, superAdminActing };
}
