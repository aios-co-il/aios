// Minimal Supabase client over fetch (PostgREST + Storage) so the worker has no dependencies.

export function createSupabaseRest({ url, serviceRoleKey }) {
  if (!url || !serviceRoleKey)
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  const base = url.replace(/\/$/, "");
  const headers = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
  };

  const request = async (path, init = {}) => {
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

  const json = async (path, init) => {
    const response = await request(path, init);
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  };

  return {
    rpc: (name, args) =>
      json(`/rest/v1/rpc/${name}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(args ?? {}),
      }),
    /** GET /rest/v1/<table>?<query> */
    select: (table, query) => json(`/rest/v1/${table}?${query}`),
    update: (table, query, patch) =>
      json(`/rest/v1/${table}?${query}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify(patch),
      }),
    insert: (table, row) =>
      json(`/rest/v1/${table}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify(row),
      }),
    download: async (bucket, path) => {
      const response = await request(
        `/storage/v1/object/${bucket}/${encodePath(path)}`,
      );
      return new Uint8Array(await response.arrayBuffer());
    },
    upload: (bucket, path, bytes, contentType) =>
      request(`/storage/v1/object/${bucket}/${encodePath(path)}`, {
        method: "POST",
        headers: { "Content-Type": contentType, "x-upsert": "true" },
        body: bytes,
      }),
    /** A URL an outside provider can fetch. The token expires with `expiresIn` seconds. */
    sign: async (bucket, path, expiresIn = 3600) => {
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

const encodePath = (path) => path.split("/").map(encodeURIComponent).join("/");
