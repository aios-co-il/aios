import type {
  PbxConfig,
  PbxExtension,
  PbxSecrets,
} from "../../../supabase/functions/_shared/telephony/types.ts";

export type { PbxExtension };

/** The settings form: config plus secrets, every field filled. */
export type PbxSettingsData = PbxConfig & PbxSecrets;

export type SetPbxField = <K extends keyof PbxSettingsData>(
  key: K,
  value: PbxSettingsData[K],
) => void;

export const EMPTY_PBX_SETTINGS: PbxSettingsData = {
  name: "",
  outbound_url: "",
  outbound_method: "POST",
  outbound_format: "json",
  outbound_auth_header: "",
  outbound_auth_value: "",
  param_caller: "caller",
  param_destination: "destination",
  param_extension: "extension",
  param_call_id: "call_id",
  default_caller_number: "",
  default_extension: "",
  extensions: [],
  inbound_secret: "",
};

export function generateSecret() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

type SavedPbxSettings = {
  config: unknown;
  inbound_secret: string;
  outbound_auth_value: string | null;
} | null;

/** Saved row merged over defaults; a new integration gets a fresh secret. */
export function formFromSaved(saved: SavedPbxSettings): PbxSettingsData {
  // JSON column written only by toPbxRow below.
  const config = (saved?.config || {}) as Partial<PbxConfig>;
  return {
    ...EMPTY_PBX_SETTINGS,
    ...config,
    extensions: Array.isArray(config.extensions) ? config.extensions : [],
    inbound_secret: saved?.inbound_secret || generateSecret(),
    outbound_auth_value: saved?.outbound_auth_value || "",
  };
}

/** Splits the form into the pbx_settings columns. */
export function toPbxRow(form: PbxSettingsData) {
  const { inbound_secret, outbound_auth_value, ...config } = form;
  return {
    config: {
      ...config,
      extensions: config.extensions.filter((e) => e.extension.trim()),
    },
    inbound_secret,
    outbound_auth_value: outbound_auth_value || null,
  };
}

export function upsertExtension(
  extensions: PbxExtension[],
  userId: string,
  patch: Partial<Omit<PbxExtension, "user_id">>,
): PbxExtension[] {
  const current = extensions.find((e) => e.user_id === userId) || {
    user_id: userId,
    extension: "",
    caller_number: "",
  };
  return [
    ...extensions.filter((e) => e.user_id !== userId),
    { ...current, ...patch },
  ];
}
