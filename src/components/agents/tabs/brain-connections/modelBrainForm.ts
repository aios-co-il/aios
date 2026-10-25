import {
  MODEL_PRESETS,
  presetById,
} from "../../../../../supabase/functions/_shared/carmen/brain-connections/presets.ts";
import { baseUrlProblem } from "../../../../../supabase/functions/_shared/carmen/brain-connections/url.ts";
import type {
  BrainConnection,
  BrainProfile,
} from "../../../../../supabase/functions/_shared/carmen/brain-connections/types.ts";

/** The add/edit dialog's fields, as typed. */
export type ModelBrainForm = {
  name: string;
  preset: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  systemPrompt: string;
  temperature: string;
  maxTokens: string;
  description: string;
  color: string;
  tier: "free" | "premium";
  clientDataOk: boolean;
  active: boolean;
};

/** Fields for a new brain (first preset) or an existing one; the key starts empty. */
export function formFor(conn: BrainConnection | null): ModelBrainForm {
  const p = conn?.profile ?? {};
  return {
    name: conn?.name ?? "",
    preset: conn ? (conn.provider_preset ?? "custom") : MODEL_PRESETS[0].id,
    baseUrl: conn ? (conn.base_url ?? "") : MODEL_PRESETS[0].base_url,
    model: conn ? (conn.model ?? "") : MODEL_PRESETS[0].models[0],
    apiKey: "",
    systemPrompt: p.system_prompt ?? "",
    temperature: p.temperature !== undefined ? String(p.temperature) : "",
    maxTokens: p.max_tokens !== undefined ? String(p.max_tokens) : "",
    description: p.description ?? "",
    color: p.color ?? "#7c5cff",
    tier: p.tier ?? (conn ? "premium" : tierOf(MODEL_PRESETS[0].id)),
    clientDataOk: p.client_data_ok === true,
    active: true,
  };
}

/** Switching preset fills its URL and first model; a blank name takes its label. */
export function withPreset(f: ModelBrainForm, id: string): ModelBrainForm {
  const p = presetById(id);
  if (!p) return f;
  return {
    ...f,
    preset: id,
    baseUrl: p.base_url || f.baseUrl,
    model: p.models[0] ?? f.model,
    name: f.name || (p.id === "custom" ? "" : p.label),
    tier: tierOf(id),
  };
}

/** A preset with a free tier starts as a free brain. */
function tierOf(presetId: string): "free" | "premium" {
  return presetById(presetId)?.free ? "free" : "premium";
}

export function profileOf(f: ModelBrainForm): BrainProfile {
  return {
    system_prompt: f.systemPrompt,
    temperature: f.temperature === "" ? undefined : Number(f.temperature),
    max_tokens: f.maxTokens === "" ? undefined : Number(f.maxTokens),
    description: f.description,
    color: f.color,
    tier: f.tier,
    client_data_ok: f.clientDataOk,
  };
}

export function urlProblem(f: ModelBrainForm): string | null {
  return f.baseUrl ? baseUrlProblem(f.baseUrl) : null;
}

/** Ready to test: endpoint, model, and a key unless the saved one is used. */
export function canTest(f: ModelBrainForm, editing: boolean): boolean {
  return (
    !!f.baseUrl &&
    !urlProblem(f) &&
    !!f.model.trim() &&
    (editing || f.apiKey.trim().length >= 8)
  );
}

export function canSave(f: ModelBrainForm, editing: boolean): boolean {
  return f.name.trim().length >= 2 && canTest(f, editing);
}

/** Props of the dialog's field groups. */
export type FormFieldsProps = {
  f: ModelBrainForm;
  set: <K extends keyof ModelBrainForm>(
    key: K,
    value: ModelBrainForm[K],
  ) => void;
};
