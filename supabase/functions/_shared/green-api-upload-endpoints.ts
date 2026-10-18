/**
 * Upload endpoints for Green API sendFileByUpload, in the order to try them.
 * Green API serves uploads from a per-instance media host
 * (https://{first 4 digits of idInstance}.media.greenapi.com). The shared
 * api.green-api.com host timed out / dropped TLS for report uploads, so it is
 * only the fallback. Hosts are fixed Green API origins, never taken from
 * settings, so a stored value can't redirect the file and token elsewhere.
 */
export function greenApiUploadEndpoints(
  instanceId: string | number,
  apiToken: string,
): string[] {
  const id = String(instanceId || "").replace(/\D/g, "");
  const path = `/waInstance${id}/sendFileByUpload/${apiToken}`;
  const hosts: string[] = [];
  if (id.length >= 4) {
    hosts.push(`https://${id.slice(0, 4)}.media.greenapi.com`);
  }
  hosts.push("https://api.green-api.com");
  return hosts.map((host) => `${host}${path}`);
}

/**
 * True only for failures that happen before the request reaches Green API
 * (DNS, TCP connect, TLS handshake). Retrying those on the next host can't
 * send the file twice. A timeout or a reset after sending may already have
 * delivered it, so those are never retried.
 */
export function isPreSubmitConnectError(err: unknown): boolean {
  const name = err instanceof Error ? err.name : "";
  if (name === "TimeoutError" || name === "AbortError") {
    return false;
  }
  const msg = err instanceof Error ? err.message : String(err);
  if (/timeout/i.test(msg)) {
    return false;
  }
  return /\(Connect\)|dns error|failed to lookup address|connection refused|tls handshake/i.test(
    msg,
  );
}
