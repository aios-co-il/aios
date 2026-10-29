const ENVIRONMENTS = ["staging", "develop", "preview", "production"];
const LEGACY = /^SUPABASE_(URL|SERVICE_ROLE_KEY)_[A-Z]+$/;

/**
 * One container serves one Supabase project, built from that environment's branch with that
 * environment's keys. Code that has only run on Staging must never claim Production jobs, and
 * Staging tenants must never spend Production fallback keys.
 */
export function loadTargets(env = process.env) {
  const legacy = Object.keys(env).filter(
    (name) => LEGACY.test(name) && env[name]?.trim(),
  );
  if (legacy.length)
    throw new Error(
      `${legacy.join(", ")}: one worker serves one environment; run a container per environment with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY`,
    );
  const url = env.SUPABASE_URL?.trim();
  const key = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key)
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  const name = env.WORKER_ENV?.trim() || env.WORKER_TARGET?.trim() || "default";
  if (name !== "default" && !ENVIRONMENTS.includes(name))
    throw new Error(`WORKER_ENV must be one of ${ENVIRONMENTS.join(", ")}`);
  let origin;
  try {
    origin = new URL(url).origin;
  } catch {
    throw new Error("invalid SUPABASE_URL");
  }
  return [{ name, url: origin, serviceRoleKey: key }];
}
