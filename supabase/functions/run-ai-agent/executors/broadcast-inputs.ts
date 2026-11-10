import type { Json } from "../../_shared/database.types.ts";

export type ListBroadcastsArgs = {
  status?:
    | "draft"
    | "scheduled"
    | "sending"
    | "sent"
    | "paused"
    | "failed"
    | "canceled";
  limit?: number;
};

export type CreateBroadcastArgs = {
  name: string;
  body_text: string;
  audience_source: "clients" | "leads" | "campaigners" | "wa_groups";
  audience_filter?: Json;
  scheduled_at?: string;
  integration_id?: string;
};

export type SendBroadcastNowArgs = { broadcast_id: string };

export type ScheduleBroadcastArgs = {
  broadcast_id: string;
  scheduled_at: string;
};

export type CancelBroadcastArgs = { broadcast_id: string };
