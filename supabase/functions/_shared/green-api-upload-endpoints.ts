/**
 * Upload endpoints for Green API sendFileByUpload, in the order to try them.
 * Green API serves uploads from a per-instance media host
 * (https://{first 4 digits of idInstance}.media.greenapi.com). The shared
 * api.green-api.com host timed out / dropped TLS for report uploads, so it is
 * only the fallback. A stored settings.media_url wins when present.
 */
export function greenApiUploadEndpoints(
  instanceId: string | number,
  apiToken: string,
  mediaUrl?: string | null,
): string[] {
  const id = String(instanceId || "").replace(/\D/g, "");
  const path = `/waInstance${id}/sendFileByUpload/${apiToken}`;
  const hosts: string[] = [];
  const custom = String(mediaUrl || "")
    .trim()
    .replace(/\/+$/, "");
  if (/^https:\/\//.test(custom)) hosts.push(custom);
  if (id.length >= 4)
    hosts.push(`https://${id.slice(0, 4)}.media.greenapi.com`);
  hosts.push("https://api.green-api.com");
  return [...new Set(hosts)].map((host) => `${host}${path}`);
}
