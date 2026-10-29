import { z, type ZodType } from "zod";
import type { Json } from "@/integrations/supabase/types";
import {
  jsonObjectTextSchema,
  listOf,
  optionalStringSchema,
  optionalTextSchema,
  type JsonObject,
} from "@/components/automations/automationStepConfig";

const manyChatTagSchema = z.object({
  id: z.union([z.string(), z.number(), z.nan()]),
  name: optionalTextSchema.transform((name) => name ?? ""),
});

export type ManyChatTag = z.infer<typeof manyChatTagSchema>;

export interface MessagingIntegrationOption {
  id: string;
  integration_type: string;
  settings: Json | null;
  user_id: string | null;
  owner_name?: string | null;
}

const manyChatTagsResponseSchema = z
  .object({ tags: z.unknown() })
  .transform(({ tags }) => listOf(manyChatTagSchema, tags) ?? []);

export function parseManyChatTags(data: unknown): ManyChatTag[] {
  return parseOrUndefined(manyChatTagsResponseSchema, data) ?? [];
}

const instanceSettingsSchema = z.object({
  idInstance: optionalStringSchema,
  instanceId: optionalStringSchema,
});

export function integrationInstanceSuffix(
  settings: Json | null | undefined,
): string | undefined {
  const s = parseOrUndefined(instanceSettingsSchema, settings);
  return s?.idInstance?.slice(-4) || s?.instanceId?.slice(-4);
}

export function parseOrUndefined<T>(
  schema: ZodType<T, z.ZodTypeDef, unknown>,
  value: unknown,
): T | undefined {
  const result = schema.safeParse(value);
  return result.success ? result.data : undefined;
}

export function parseConditionsObject(
  text: string,
  invalidMessage: string,
): JsonObject {
  const result = jsonObjectTextSchema.safeParse(text);
  if (!result.success) throw new Error(invalidMessage);
  return result.data;
}

const triggerFilterSourceSchema = z.object({
  filter_statuses: z.custom<Json | undefined>(),
  new_statuses: z.custom<Json | undefined>(),
  filter_status: optionalTextSchema,
  filter_status_kind: optionalStringSchema,
  new_status: optionalTextSchema,
  status_kind: optionalStringSchema,
});

export function triggerFilterSource(conditions: Json | null | undefined) {
  return parseOrUndefined(triggerFilterSourceSchema, conditions) ?? null;
}

const actionStatusSourceSchema = z.object({
  status: optionalStringSchema,
  status_field: optionalStringSchema,
  entity: optionalStringSchema,
});

export function actionStatusSource(configuration: Json | null | undefined) {
  return parseOrUndefined(actionStatusSourceSchema, configuration) ?? null;
}
