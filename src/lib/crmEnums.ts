import { z } from "zod";
import { Constants, type Enums } from "@/integrations/supabase/types";

export type ClientMoodStatusEnum = Enums<"client_mood_status">;
export type ClientStatusEnum = Enums<"client_status">;
export type LeadSourceEnum = Enums<"lead_source">;

export const clientMoodStatusSchema = z.enum(
  Constants.public.Enums.client_mood_status,
);
export const clientStatusSchema = z.enum(Constants.public.Enums.client_status);
export const leadSourceSchema = z.enum(Constants.public.Enums.lead_source);

export const isClientMoodStatus = (
  value: unknown,
): value is ClientMoodStatusEnum =>
  clientMoodStatusSchema.safeParse(value).success;

export const isClientStatus = (value: unknown): value is ClientStatusEnum =>
  clientStatusSchema.safeParse(value).success;

export const isLeadSource = (value: unknown): value is LeadSourceEnum =>
  leadSourceSchema.safeParse(value).success;

/** The message zod gives for a value outside a `z.enum` (shown when a stored value can't be edited in a form). */
export const invalidEnumMessage = (
  allowed: readonly string[],
  received: string,
): string =>
  `Invalid enum value. Expected ${allowed.map((v) => `'${v}'`).join(" | ")}, received '${received}'`;
