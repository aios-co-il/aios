// Shapes shared by the PBX edge functions and the settings page
// (src/components/PbxSettingsPage imports this file).
// `type` aliases, not interfaces, so the config is assignable to JSON columns.

export type PbxExtension = {
  user_id: string;
  extension: string;
  caller_number?: string;
};

/** Non-secret PBX config, stored in pbx_settings.config. */
export type PbxConfig = {
  name: string;
  outbound_url: string;
  outbound_method: "POST" | "GET";
  outbound_format: "json" | "form";
  outbound_auth_header: string;
  param_caller: string;
  param_destination: string;
  param_extension: string;
  param_call_id: string;
  default_caller_number: string;
  default_extension: string;
  extensions: PbxExtension[];
};

/** Secrets, stored in their own pbx_settings columns. */
export type PbxSecrets = {
  inbound_secret: string;
  outbound_auth_value: string;
};

/** What the edge functions work with; saved config may miss any field. */
export type PbxSettings = Partial<PbxConfig> & Partial<PbxSecrets>;

export type OutboundCall = {
  callerNumber: string | null;
  destinationNumber: string;
  extension: string | null;
  callId: string;
};

export type CallDirection = "inbound" | "outbound" | null;

export type PbxEvent = {
  callId: string | null;
  caller: string | null;
  called: string | null;
  extension: string | null;
  direction: CallDirection;
  leadPhone: string | null;
  status: string | null;
  duration: number | null;
  recordingUrl: string | null;
};
