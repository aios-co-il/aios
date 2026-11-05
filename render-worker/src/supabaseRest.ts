// Minimal Supabase client over fetch (PostgREST + Storage) so the worker has no dependencies.

/** A service-role client for one project: PostgREST reads and writes, and Storage files. */
export function createSupabaseRest({
  url,
  serviceRoleKey,
}: {
  url: string;
  serviceRoleKey: string;
}) {
  if (!url || !serviceRoleKey)
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  const base = url.replace(/\/$/, "");
  const headers = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
  };

  const request = async (path: string, init: RequestInit = {}) => {
    const response = await fetch(`${base}${path}`, {
      ...init,
      headers: { ...headers, ...(init.headers ?? {}) },
    });
    if (!response.ok) {
      throw new Error(
        `${init.method ?? "GET"} ${path}: ${response.status} ${(await response.text()).slice(0, 500)}`,
      );
    }
    return response;
  };

  const json = async (path: string, init?: RequestInit) => {
    const response = await request(path, init);
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  };

  return {
    rpc: (name: string, args?: object) =>
      json(`/rest/v1/rpc/${name}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(args ?? {}),
      }),
    /** GET /rest/v1/<table>?<query> */
    select: (table: string, query: string) =>
      json(`/rest/v1/${table}?${query}`),
    update: (table: string, query: string, patch: object) =>
      json(`/rest/v1/${table}?${query}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify(patch),
      }),
    insert: (table: string, row: object) =>
      json(`/rest/v1/${table}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify(row),
      }),
    download: async (bucket: string, path: string) => {
      const response = await request(
        `/storage/v1/object/${bucket}/${encodePath(path)}`,
      );
      return new Uint8Array(await response.arrayBuffer());
    },
    upload: (
      bucket: string,
      path: string,
      bytes: Uint8Array,
      contentType: string,
    ) =>
      request(`/storage/v1/object/${bucket}/${encodePath(path)}`, {
        method: "POST",
        headers: { "Content-Type": contentType, "x-upsert": "true" },
        body: bytes,
      }),
    /** A URL an outside provider can fetch. The token expires with `expiresIn` seconds. */
    sign: async (bucket: string, path: string, expiresIn = 3600) => {
      const data = await json(
        `/storage/v1/object/sign/${bucket}/${encodePath(path)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ expiresIn }),
        },
      );
      const signed = data?.signedURL || data?.signedUrl;
      if (!signed) throw new Error("storage sign returned no url");
      if (signed.startsWith("http")) return signed;
      if (signed.startsWith("/object/")) return `${base}/storage/v1${signed}`;
      return `${base}${signed.startsWith("/") ? "" : "/"}${signed}`;
    },
  };
}

/** Encodes an object path; . and .. segments are refused so a path cannot leave its folder. */
const encodePath = (path: string) => {
  const segments = String(path).split("/");
  if (
    segments.some((segment) => !segment || segment === "." || segment === "..")
  )
    throw new Error(`invalid storage path: ${String(path).slice(0, 120)}`);
  return segments.map(encodeURIComponent).join("/");
};

/** The worker's Supabase client. */
export type SupabaseRest = ReturnType<typeof createSupabaseRest>;
