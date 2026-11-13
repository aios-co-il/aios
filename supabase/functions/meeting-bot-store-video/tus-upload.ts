// Streams a body into Supabase Storage with the resumable (TUS) protocol, so a
// file of any size passes through an edge function holding one chunk at a time.

/** Supabase's resumable endpoint takes chunks of exactly 6MB (the last may be smaller). */
export const TUS_CHUNK_BYTES = 6 * 1024 * 1024;

const TUS_VERSION = "1.0.0";

export interface TusUploadInput {
  /** `${SUPABASE_URL}/storage/v1/upload/resumable` */
  endpoint: string;
  /** The service key, sent as both `apikey` and the bearer token. */
  serviceKey: string;
  bucket: string;
  objectName: string;
  contentType: string;
  body: ReadableStream<Uint8Array>;
  /** Total bytes the body will yield. */
  length: number;
  fetchFn?: typeof fetch;
  chunkBytes?: number;
}

/**
 * Creates the upload, then PATCHes the body in fixed-size chunks. Throws on any
 * non-2xx response, on a server offset that disagrees with ours, and when the
 * body yields a different number of bytes than `length`.
 */
export async function tusUpload(input: TusUploadInput): Promise<void> {
  const fetchFn = input.fetchFn ?? fetch;
  const chunkBytes = input.chunkBytes ?? TUS_CHUNK_BYTES;
  const uploadUrl = await createUpload(input, fetchFn);

  let offset = 0;
  for await (const chunk of fixedSizeChunks(input.body, chunkBytes)) {
    if (offset + chunk.byteLength > input.length) {
      throw new Error(`body is longer than the declared ${input.length} bytes`);
    }
    offset = await patchChunk(input, fetchFn, uploadUrl, offset, chunk);
  }
  if (offset !== input.length) {
    throw new Error(
      `body ended at ${offset} of the declared ${input.length} bytes`,
    );
  }
}

/** POSTs the upload's length and metadata; returns the URL to PATCH. */
async function createUpload(
  input: TusUploadInput,
  fetchFn: typeof fetch,
): Promise<string> {
  const res = await fetchFn(input.endpoint, {
    method: "POST",
    headers: {
      ...authHeaders(input.serviceKey),
      "tus-resumable": TUS_VERSION,
      "upload-length": String(input.length),
      "upload-metadata": uploadMetadata({
        bucketName: input.bucket,
        objectName: input.objectName,
        contentType: input.contentType,
      }),
      "x-upsert": "true",
    },
  });
  const detail = await res.text();
  if (!res.ok) {
    throw new Error(
      `TUS create failed (${res.status}): ${detail.slice(0, 200)}`,
    );
  }
  const location = res.headers.get("location");
  if (!location) {
    throw new Error("TUS create returned no Location header");
  }
  return new URL(location, input.endpoint).toString();
}

/** Sends one chunk at `offset`; returns the offset the server now holds. */
async function patchChunk(
  input: TusUploadInput,
  fetchFn: typeof fetch,
  uploadUrl: string,
  offset: number,
  chunk: Uint8Array<ArrayBuffer>,
): Promise<number> {
  const res = await fetchFn(uploadUrl, {
    method: "PATCH",
    headers: {
      ...authHeaders(input.serviceKey),
      "tus-resumable": TUS_VERSION,
      "upload-offset": String(offset),
      "content-type": "application/offset+octet-stream",
    },
    body: chunk,
  });
  const detail = await res.text();
  if (!res.ok) {
    throw new Error(
      `TUS PATCH at offset ${offset} failed (${res.status}): ${detail.slice(0, 200)}`,
    );
  }
  const expected = offset + chunk.byteLength;
  const serverOffset = Number(res.headers.get("upload-offset"));
  if (serverOffset !== expected) {
    throw new Error(
      `TUS PATCH at offset ${offset}: server holds ${serverOffset}, expected ${expected}`,
    );
  }
  return expected;
}

/**
 * Regroups a stream's pieces into chunks of exactly `size` bytes; only the
 * last is shorter. Holds at most one chunk in memory.
 */
export async function* fixedSizeChunks(
  body: ReadableStream<Uint8Array>,
  size: number,
): AsyncGenerator<Uint8Array<ArrayBuffer>> {
  let buffer = new Uint8Array(size);
  let filled = 0;
  for await (const piece of body) {
    let read = 0;
    while (read < piece.byteLength) {
      const take = Math.min(size - filled, piece.byteLength - read);
      buffer.set(piece.subarray(read, read + take), filled);
      filled += take;
      read += take;
      if (filled === size) {
        yield buffer;
        // A fresh buffer: the caller may still hold the one just yielded.
        buffer = new Uint8Array(size);
        filled = 0;
      }
    }
  }
  if (filled > 0) {
    yield buffer.subarray(0, filled);
  }
}

/** TUS `Upload-Metadata`: comma-separated `key base64(value)` pairs. */
function uploadMetadata(values: Record<string, string>): string {
  return Object.entries(values)
    .map(([key, value]) => `${key} ${base64Utf8(value)}`)
    .join(",");
}

/** Base64 of a string's UTF-8 bytes (btoa alone rejects non-Latin-1). */
function base64Utf8(value: string): string {
  let binary = "";
  for (const byte of new TextEncoder().encode(value)) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

/** The headers supabase-js sends with a service key. */
function authHeaders(serviceKey: string): Record<string, string> {
  return { apikey: serviceKey, authorization: `Bearer ${serviceKey}` };
}
