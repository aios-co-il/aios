/**
 * Where a tenant's built-in brain keys come from (AIO-303). Each brain's id
 * and key come from one source, never mixed:
 *   1. the tenant's own complete row (key, plus id when the brain needs one);
 *   2. a share from another tenant, which passes on what that tenant holds:
 *      its own complete row, or the project keys when it is a home tenant;
 *   3. the project env secrets, only for a home tenant.
 * A shared-in key is not passed on again.
 */
import { BUILTIN_BRAIN_KEYS, type BuiltinBrainKey } from "./builtin-keys.ts";
import {
  type BuiltinRow,
  type Loaded,
  loadSources,
} from "./key-source-load.ts";
import {
  connectionSecret,
  type SecretClient,
  settingString,
} from "./overrides.ts";

export type Env = Record<string, string | undefined>;

export type KeySource =
  | { kind: "own" }
  | { kind: "project" }
  | { kind: "shared"; fromTenantId: string };

/** One built-in brain's source and the env values its launchers read. */
export type BuiltinKeys = {
  slug: string;
  source: KeySource | null;
  env: Record<string, string>;
};

type Held = { env: Record<string, string>; via: "own" | "project" };

/** Every built-in brain of this tenant with its key source. */
export async function resolveBuiltinKeys(
  sb: SecretClient,
  tenantId: string,
  project: Env,
): Promise<BuiltinKeys[]> {
  const loaded = await loadSources(sb, tenantId);
  const out: BuiltinKeys[] = [];
  for (const spec of BUILTIN_BRAIN_KEYS) {
    out.push(await resolveOne(sb, spec, tenantId, loaded, project));
  }
  return out;
}

/** The project env without any built-in brain's names. */
export function withoutBuiltinEnv(project: Env): Env {
  const out = { ...project };
  for (const spec of BUILTIN_BRAIN_KEYS) {
    for (const name of spec.envNames) delete out[name];
  }
  return out;
}

/** The env a send reads: project env minus brain keys, plus resolved keys. */
export function brainEnvFrom(project: Env, keys: BuiltinKeys[]): Env {
  const out = withoutBuiltinEnv(project);
  for (const k of keys) Object.assign(out, k.env);
  return out;
}

async function resolveOne(
  sb: SecretClient,
  spec: BuiltinBrainKey,
  tenantId: string,
  loaded: Loaded,
  project: Env,
): Promise<BuiltinKeys> {
  const held = await heldKeys(sb, spec, tenantId, loaded, project);
  if (held) {
    return { slug: spec.slug, source: { kind: held.via }, env: held.env };
  }
  const fromTenantId = loaded.shares.get(spec.slug);
  const shared = fromTenantId
    ? await heldKeys(sb, spec, fromTenantId, loaded, project)
    : null;
  if (fromTenantId && shared) {
    return {
      slug: spec.slug,
      source: { kind: "shared", fromTenantId },
      env: shared.env,
    };
  }
  return { slug: spec.slug, source: null, env: {} };
}

/** What `tenantId` itself holds for one brain: its own row, else project keys. */
async function heldKeys(
  sb: SecretClient,
  spec: BuiltinBrainKey,
  tenantId: string,
  loaded: Loaded,
  project: Env,
): Promise<Held | null> {
  const row = loaded.rows.find(
    (r) => r.tenant_id === tenantId && r.slug === spec.slug,
  );
  const own = row ? await rowEnv(sb, spec, row) : null;
  if (own) return { env: own, via: "own" };
  if (!loaded.homes.has(tenantId)) return null;
  const env = projectEnvFor(spec, project);
  return env ? { env, via: "project" } : null;
}

/** A row's key and id; null unless both parts the brain needs are saved. */
async function rowEnv(
  sb: SecretClient,
  spec: BuiltinBrainKey,
  row: BuiltinRow,
): Promise<Record<string, string> | null> {
  const id = settingString(row.settings, "external_id");
  if (!row.secret_id || (spec.idEnv && !id)) return null;
  const secret = (await connectionSecret(sb, row.id)).trim();
  if (!secret) return null;
  const env: Record<string, string> = { [spec.secretEnv]: secret };
  if (spec.idEnv) env[spec.idEnv] = id;
  return env;
}

/** The project's values for one brain; null when it has none. */
function projectEnvFor(
  spec: BuiltinBrainKey,
  project: Env,
): Record<string, string> | null {
  const env: Record<string, string> = {};
  for (const name of spec.envNames) {
    const value = project[name]?.trim();
    if (value) env[name] = value;
  }
  return Object.keys(env).length ? env : null;
}
