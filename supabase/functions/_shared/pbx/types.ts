// Shapes shared by the PBX integration's edge functions.

export interface PbxExtension {
  user_id: string;
  extension: string;
  caller_number?: string;
}

export interface PbxSettings {
  name?: string;
  outbound_url?: string;
  outbound_method?: "POST" | "GET";
  outbound_format?: "json" | "form";
  outbound_auth_header?: string;
  outbound_auth_value?: string;
  param_caller?: string;
  param_destination?: string;
  param_extension?: string;
  param_call_id?: string;
  default_caller_number?: string;
  default_extension?: string;
  extensions?: PbxExtension[];
  inbound_secret?: string;
}

export interface OutboundCall {
  callerNumber: string | null;
  destinationNumber: string;
  extension: string | null;
  callId: string;
}

export type CallDirection = "inbound" | "outbound" | null;

export interface PbxEvent {
  callId: string | null;
  caller: string | null;
  called: string | null;
  extension: string | null;
  direction: CallDirection;
  leadPhone: string | null;
  status: string | null;
  duration: number | null;
  recordingUrl: string | null;
}
