/** Built-in brains on the settings screen: key source and shares (AIO-303). */
import {
  type Env,
  resolveBuiltinKeys,
} from "../_shared/carmen/brain-connections/key-source.ts";
import { settingString } from "../_shared/carmen/brain-connections/overrides.ts";
import { BUILTIN_BRAIN_KEYS } from "../_shared/carmen/brain-connections/builtin-keys.ts";
import type {
  BuiltinBrainState,
  TenantRef,
} from "../_shared/carmen/brain-connections/types.ts";
import { projectEnv } from "../_shared/agent-channel/brain-env.ts";
import { type ActionContext, check } from "./request.ts";
import { shareTargetIds } from "./share-targets.ts";

type OwnRow = {
  kind: string;
  slug: string;
  settings: unknown;
  key_last4: string | null;
};

/** Each built-in brain's state, and the tenants the caller can share with. */
export async function builtinState(
  ctx: ActionContext,
  rows: OwnRow[],
  project: Env = projectEnv(),
): Promise<{ builtins: BuiltinBrainState[]; share_targets: TenantRef[] }> {
  const [keys, sharesOut, targetIds] = await Promise.all([
    resolveBuiltinKeys(ctx.sb, ctx.tenantId, project),
    ctx.sb
      .from("carmen_brain_key_shares")
      .select("target_tenant_id, builtin_slug")
      .eq("source_tenant_id", ctx.tenantId),
    shareTargetIds(ctx),
  ]);
  check(sharesOut.error, "Loading brain shares");

  const names = await tenantNames(ctx, [
    ...targetIds,
    ...(sharesOut.data ?? []).map((s) => s.target_tenant_id),
    ...keys.flatMap((k) =>
      k.source?.kind === "shared" ? [k.source.fromTenantId] : [],
    ),
  ]);
  const ref = (id: string): TenantRef => ({ id, name: names.get(id) ?? id });

  const builtins = BUILTIN_BRAIN_KEYS.map((spec): BuiltinBrainState => {
    const row = rows.find((r) => r.kind === "builtin" && r.slug === spec.slug);
    const source = keys.find((k) => k.slug === spec.slug)?.source ?? null;
    return {
      slug: spec.slug,
      label: spec.label,
      id_label: spec.idLabel ?? null,
      external_id: settingString(row?.settings, "external_id") || null,
      key_last4: row?.key_last4 ?? null,
      source: source?.kind ?? null,
      shared_from: source?.kind === "shared" ? ref(source.fromTenantId) : null,
      shared_to: (sharesOut.data ?? [])
        .filter((s) => s.builtin_slug === spec.slug)
        .map((s) => ref(s.target_tenant_id)),
      can_share: source?.kind === "own" || source?.kind === "project",
    };
  });
  const shareTargets = targetIds
    .map(ref)
    .sort((a, b) => a.name.localeCompare(b.name));
  return { builtins, share_targets: shareTargets };
}

/** Names of the given tenants, by id. */
async function tenantNames(
  ctx: ActionContext,
  ids: string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  if (!unique.length) return new Map();
  const { data, error } = await ctx.sb
    .from("tenants")
    .select("id, name")
    .in("id", unique);
  check(error, "Loading organization names");
  return new Map((data ?? []).map((t) => [t.id, t.name]));
}
