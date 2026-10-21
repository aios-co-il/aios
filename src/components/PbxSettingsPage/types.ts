export type PbxExtension = {
  user_id: string;
  extension: string;
  caller_number?: string;
};

export type PbxSettingsData = {
  name: string;
  outbound_url: string;
  outbound_method: "POST" | "GET";
  outbound_format: "json" | "form";
  outbound_auth_header: string;
  outbound_auth_value: string;
  param_caller: string;
  param_destination: string;
  param_extension: string;
  param_call_id: string;
  default_caller_number: string;
  default_extension: string;
  extensions: PbxExtension[];
  inbound_secret: string;
};

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

/** Saved settings merged over defaults; a new integration gets a fresh secret. */
export function formFromSaved(saved: unknown): PbxSettingsData {
  const s = (saved || {}) as Partial<PbxSettingsData>;
  return {
    ...EMPTY_PBX_SETTINGS,
    ...s,
    extensions: Array.isArray(s.extensions) ? s.extensions : [],
    inbound_secret: s.inbound_secret || generateSecret(),
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
