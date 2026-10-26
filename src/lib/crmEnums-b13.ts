import { Constants, type Enums } from "@/integrations/supabase/types";

export type ClientMoodStatusEnum = Enums<"client_mood_status">;
export type ClientStatusEnum = Enums<"client_status">;

export const isClientMoodStatus = (
  value: unknown,
): value is ClientMoodStatusEnum =>
  Constants.public.Enums.client_mood_status.some((status) => status === value);

export const isClientStatus = (value: unknown): value is ClientStatusEnum =>
  Constants.public.Enums.client_status.some((status) => status === value);

export type LeadSourceEnum = Enums<"lead_source">;

export const isLeadSource = (value: unknown): value is LeadSourceEnum =>
  Constants.public.Enums.lead_source.some((source) => source === value);
