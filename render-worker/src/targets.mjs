const NAMED = ["production", "staging", "develop"];

function originOf(name, url) {
  try {
    return new URL(url).origin;
  } catch {
    throw new Error(`invalid Supabase URL for ${name}`);
  }
}

/**
 * One worker process polls every configured Supabase project.
 * The unsuffixed SUPABASE_URL pair stays valid for a single-environment droplet.
 * Named pairs add production, staging and develop without a second container.
 * The same origin is polled once.
 */
export function loadTargets(env = process.env) {
  const targets = [];
  const bareUrl = env.SUPABASE_URL?.trim();
  const bareKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (bareUrl || bareKey) {
    if (!bareUrl || !bareKey)
      throw new Error(
        "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required together",
      );
    targets.push({
      name: env.WORKER_TARGET?.trim() || "default",
      url: bareUrl,
      serviceRoleKey: bareKey,
    });
  }
  for (const name of NAMED) {
    const suffix = name.toUpperCase();
    const url = env[`SUPABASE_URL_${suffix}`]?.trim();
    const key = env[`SUPABASE_SERVICE_ROLE_KEY_${suffix}`]?.trim();
    if (!url && !key) continue;
    if (!url || !key)
      throw new Error(
        `SUPABASE_URL_${suffix} and SUPABASE_SERVICE_ROLE_KEY_${suffix} are required together`,
      );
    targets.push({ name, url, serviceRoleKey: key });
  }
  const seen = new Set();
  const unique = [];
  for (const target of targets) {
    const url = originOf(target.name, target.url);
    if (seen.has(url)) continue;
    seen.add(url);
    unique.push({ ...target, url });
  }
  if (!unique.length)
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  return unique;
}
