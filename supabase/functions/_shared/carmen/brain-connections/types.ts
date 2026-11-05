/**
 * Shapes shared by the carmen-brain-connections edge function and the
 * settings UI, so both sides read the same contract.
 */

export type BrainConnectionKind = "chat_model" | "builtin";

export type BrainProfile = {
  system_prompt?: string;
  temperature?: number;
  max_tokens?: number;
  description?: string;
  color?: string;
  /** "נתב חכם" picks free models first; a premium model never runs on its own. */
  tier?: "free" | "premium";
  /** The owner allows client data to be sent to this model. */
  client_data_ok?: boolean;
};

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

/** A connection as the browser sees it: no Vault id, only the key's last 4. */
export type BrainConnection = {
  id: string;
  slug: string;
  name: string;
  kind: BrainConnectionKind;
  provider_preset: string | null;
  base_url: string | null;
  model: string | null;
  profile: BrainProfile;
  key_last4: string | null;
};

export type BrainRouteType =
  "internal" | "direct_channel" | "parliament" | "model";

/** One row of the brain picker, including hidden (inactive) brains. */
export type BrainRouteSummary = {
  id: string;
  slug: string;
  label: string;
  route_type: BrainRouteType;
  provider: string | null;
  connection_id: string | null;
  config: Record<string, unknown>;
  active: boolean;
};

/** Where a built-in brain's keys come from for this tenant (AIO-303). */
export type BuiltinKeySourceKind = "own" | "shared" | "project";

export type TenantRef = { id: string; name: string };

/** A built-in brain's key state; secrets are reported as last 4 only. */
export type BuiltinBrainState = {
  slug: string;
  label: string;
  id_label: string | null;
  external_id: string | null;
  key_last4: string | null;
  /** null: the brain is not configured for this tenant. */
  source: BuiltinKeySourceKind | null;
  /** The tenant that shares its keys, when source is "shared". */
  shared_from: TenantRef | null;
  /** Tenants this tenant shares the brain with. */
  shared_to: TenantRef[];
  /** This tenant holds the keys itself, so it may share them. */
  can_share: boolean;
};

export type BrainConnectionsState = {
  connections: BrainConnection[];
  routes: BrainRouteSummary[];
  builtins: BuiltinBrainState[];
  /** Tenants the caller may share built-in brains with: every other tenant
   * for a super admin, else the other tenants they belong to (AIO-354). */
  share_targets: TenantRef[];
};
