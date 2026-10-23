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

/** A built-in brain's key state; secrets are reported as booleans only. */
export type BuiltinBrainState = {
  slug: string;
  label: string;
  id_label: string | null;
  external_id: string | null;
  key_last4: string | null;
  env_configured: boolean;
};

export type BrainConnectionsState = {
  connections: BrainConnection[];
  routes: BrainRouteSummary[];
  builtins: BuiltinBrainState[];
};
