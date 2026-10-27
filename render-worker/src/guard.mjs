// Run input is written by tenant members (marketing_runs allows their inserts), so the
// worker never trusts a path or URL from it: storage paths must stay inside the run's
// tenant folder, and remote files may only come from known media hosts.

/** A creative-video object path inside the run's tenant folder; rejects . / .. segments. */
export function assertTenantPath(tenantId, path) {
  const value = String(path ?? "");
  const segments = value.split("/");
  if (
    !tenantId ||
    segments[0] !== String(tenantId) ||
    segments.some(
      (segment) => !segment || segment === "." || segment === "..",
    ) ||
    /[\\\0]/.test(value)
  )
    throw new Error(
      `storage path outside the tenant folder: ${value.slice(0, 120)}`,
    );
  return value;
}

/** A storage path component that came from data (client id, scene id): no slashes or dots. */
export function safeSegment(value, fallback = "general") {
  const text = String(value ?? "").trim();
  return /^[A-Za-z0-9_-]{1,80}$/.test(text) ? text : fallback;
}

const defaultHosts = () =>
  [
    process.env.SUPABASE_URL && new URL(process.env.SUPABASE_URL).host,
    ...String(process.env.MEDIA_URL_HOSTS ?? "")
      .split(",")
      .map((host) => host.trim())
      .filter(Boolean),
  ].filter(Boolean);

/** Private buckets the app links to by URL, such as an uploaded logo in payload.logo_url. */
const LINKED_PRIVATE_BUCKETS = new Set(["entity-attachments"]);

/**
 * The bucket and path behind a link to one of this project's private buckets, or null.
 * The app keeps uploads as entity-attachments links that nobody can fetch as they are, and
 * signs them when it reads them (src/components/marketing/lib/resolveCreativeImageUrl.ts).
 * The worker downloads them with its own key instead.
 */
export function privateStoragePath(url, projectUrl = process.env.SUPABASE_URL) {
  let link;
  let project;
  try {
    link = new URL(String(url));
    project = new URL(String(projectUrl));
  } catch {
    return null;
  }
  if (link.host !== project.host) return null;
  const match = link.pathname.match(
    /^\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+)$/,
  );
  if (!match || !LINKED_PRIVATE_BUCKETS.has(match[1])) return null;
  try {
    return { bucket: match[1], path: decodeURIComponent(match[2]) };
  } catch {
    return null;
  }
}

/** https only, on the Supabase project, *.supabase.co, or MEDIA_URL_HOSTS. */
export function assertMediaUrl(url, hosts = defaultHosts()) {
  let parsed;
  try {
    parsed = new URL(String(url));
  } catch {
    throw new Error("media url is not a valid URL");
  }
  const allowed =
    parsed.protocol === "https:" &&
    (hosts.includes(parsed.host) || parsed.hostname.endsWith(".supabase.co"));
  if (!allowed) throw new Error(`media host not allowed: ${parsed.host}`);
  return parsed.toString();
}

/**
 * The run's work item, checked against the run's tenant. Every job derives its storage
 * folder (client id) from here instead of from run.input.
 */
export async function loadRunItem(db, run) {
  const [item] =
    (await db.select(
      "marketing_work_items",
      `id=eq.${encodeURIComponent(run.item_id)}&tenant_id=eq.${encodeURIComponent(run.tenant_id)}&select=id,tenant_id,client_id`,
    )) ?? [];
  if (!item)
    throw new Error("run item is not in the run's tenant (is required)");
  return {
    ...item,
    folder: `${run.tenant_id}/${safeSegment(item.client_id)}/${item.id}`,
  };
}

/** The run's scene, checked against the run's item and tenant. */
export async function loadRunScene(db, run, columns) {
  const [scene] =
    (await db.select(
      "marketing_video_scenes",
      `id=eq.${encodeURIComponent(run.scene_id)}&item_id=eq.${encodeURIComponent(run.item_id)}&tenant_id=eq.${encodeURIComponent(run.tenant_id)}&select=${columns}`,
    )) ?? [];
  if (!scene)
    throw new Error("run scene is not in the run's item (is required)");
  return scene;
}

/** Marks an error as final: a paid result exists or input is invalid, so a retry would pay again. */
export const finalError = (message) =>
  Object.assign(new Error(message), { final: true });
