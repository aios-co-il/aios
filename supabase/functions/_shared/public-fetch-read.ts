/**
 * Reading a response to the end for public-fetch.ts, which sends `Connection: close` and reads
 * until the server hangs up.
 */

/** What `readUntilClosed` reads from: a connection's `read`, as `Deno.Conn` has it. */
export interface Readable {
  read(buffer: Uint8Array): Promise<number | null>;
}

/**
 * Reads the whole response the server sends before it closes (`Connection: close`), stopping
 * past `cap` bytes. A server that drops the connection without a TLS close_notify has still sent
 * everything; rustls reports that as UnexpectedEof, which ends the read like a plain close (the
 * web app's host did this on Staging, 3 Nov, so Carmen could not use her own skin portraits).
 * `cleanClose` is false then: `bodyProblem` accepts such a body only when Content-Length or the
 * chunked end shows it whole, since an unframed body could have been cut at any point.
 */
export async function readUntilClosed(
  conn: Readable,
  cap: number,
): Promise<{ raw: Uint8Array; capped: boolean; cleanClose: boolean }> {
  const chunks: Array<Uint8Array> = [];
  let total = 0;
  let cleanClose = true;
  const buffer = new Uint8Array(16_384);
  while (total <= cap) {
    const n = await readOrEnd(conn, buffer);
    if (n === "no_close_notify") {
      cleanClose = false;
      break;
    }
    if (n === null) {
      break;
    }
    chunks.push(buffer.slice(0, n));
    total += n;
  }
  const raw = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    raw.set(chunk, at);
    at += chunk.length;
  }
  return { raw, capped: total > cap, cleanClose };
}

/** One read; a close without TLS close_notify ends the stream and is reported as such. */
async function readOrEnd(
  conn: Readable,
  buffer: Uint8Array,
): Promise<number | null | "no_close_notify"> {
  try {
    return await conn.read(buffer);
  } catch (error) {
    if (error instanceof Deno.errors.UnexpectedEof) {
      return "no_close_notify";
    }
    throw error;
  }
}
