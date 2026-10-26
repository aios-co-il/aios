import type { ZodType } from "zod";
import type { Json } from "@/integrations/supabase/types";
import {
  cfgObject,
  cfgString,
  cfgText,
  isJsonObject,
  type JsonObject,
} from "@/lib/automationStepConfig";

export interface ManyChatTag {
  id: string | number;
  name: string;
}

export interface MessagingIntegrationOption {
  id: string;
  integration_type: string;
  settings: Json | null;
  user_id: string | null;
  owner_name?: string | null;
}

export function parseManyChatTags(data: unknown): ManyChatTag[] {
  const tags = isJsonObject(data) ? data.tags : undefined;
  if (!Array.isArray(tags)) return [];
  return tags.flatMap((tag) => {
    if (!isJsonObject(tag)) return [];
    const { id } = tag;
    if (typeof id !== "string" && typeof id !== "number") return [];
    return [{ id, name: cfgText(tag.name) ?? "" }];
  });
}

export function integrationInstanceSuffix(
  settings: Json | null | undefined,
): string | undefined {
  const s = cfgObject(settings);
  return (
    cfgString(s?.idInstance)?.slice(-4) || cfgString(s?.instanceId)?.slice(-4)
  );
}

export function parseOrUndefined<T>(
  schema: ZodType<T>,
  value: unknown,
): T | undefined {
  const result = schema.safeParse(value);
  return result.success ? result.data : undefined;
}

export function parseConditionsObject(
  text: string,
  invalidMessage: string,
): JsonObject {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(invalidMessage);
  }
  if (!isJsonObject(parsed)) throw new Error(invalidMessage);
  return parsed;
}

export function triggerFilterSource(conditions: Json | null | undefined) {
  const c = cfgObject(conditions);
  if (!c) return null;
  return {
    filter_statuses: c.filter_statuses,
    new_statuses: c.new_statuses,
    filter_status: cfgText(c.filter_status),
    filter_status_kind: cfgString(c.filter_status_kind),
    new_status: cfgText(c.new_status),
    status_kind: cfgString(c.status_kind),
  };
}

export function actionStatusSource(configuration: Json | null | undefined) {
  const c = cfgObject(configuration);
  if (!c) return null;
  return {
    status: cfgString(c.status),
    status_field: cfgString(c.status_field),
    entity: cfgString(c.entity),
  };
}
