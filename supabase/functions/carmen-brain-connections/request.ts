/** Request context and input validation for carmen-brain-connections. */
import { sanitizeProfile } from "../_shared/carmen/brain-connections/profile.ts";
import {
  baseUrlProblem,
  normalizeBaseUrl,
} from "../_shared/carmen/brain-connections/url.ts";
import type { DbClient } from "../_shared/supabase-clients.ts";

/** An error whose message is safe to show the caller. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export type ActionContext = {
  sb: DbClient;
  tenantId: string;
  agentId: string | null;
  userId: string;
  body: Record<string, unknown>;
};

/** A trimmed string field of the body, or "" when absent. */
export function text(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  return typeof value === "string" ? value.trim() : "";
}

/** True when the body carries the field at all (even empty). */
export function has(body: Record<string, unknown>, key: string): boolean {
  return body[key] !== undefined;
}

export function requireName(body: Record<string, unknown>): string {
  const name = text(body, "name").slice(0, 80);
  if (name.length < 2) throw new HttpError(400, "Name is required");
  return name;
}

export function requireBaseUrl(raw: string): string {
  const url = normalizeBaseUrl(raw);
  const problem = baseUrlProblem(url);
  if (problem) throw new HttpError(400, problem);
  return url;
}

export function requireModel(body: Record<string, unknown>): string {
  const model = text(body, "model");
  if (!model) throw new HttpError(400, "Model is required");
  if (model.length > 200) throw new HttpError(400, "Model name is too long");
  return model;
}

/** The body's api_key, validated; "" when the caller sent none. */
export function optionalApiKey(body: Record<string, unknown>): string {
  const key = text(body, "api_key");
  if (!key) return "";
  if (key.length < 8) throw new HttpError(400, "API key is too short");
  if (key.length > 4096) throw new HttpError(400, "API key is too long");
  if (/\s/.test(key))
    throw new HttpError(400, "API key must not contain spaces");
  return key;
}

export function requireApiKey(body: Record<string, unknown>): string {
  const key = optionalApiKey(body);
  if (!key) throw new HttpError(400, "API key is required");
  return key;
}

export function profileOf(body: Record<string, unknown>) {
  return sanitizeProfile(body.profile);
}

/** Throws a generic error for a failed query; the detail goes to the log. */
export function check(error: { message: string } | null, what: string) {
  if (!error) return;
  console.error(`[carmen-brain-connections] ${what}:`, error.message);
  throw new HttpError(500, `${what} failed`);
}
