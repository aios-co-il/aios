/**
 * The only addresses a WhatsApp webhook may fetch an inbound picture from (AIO-683): each
 * provider's own media host, for the line that received the message. Every address a
 * webhook payload names, and every redirect it leads to, is checked here first, so a forged
 * or odd payload cannot point the server at another host or a private address.
 */
import { isPrivateHost } from "../brain-connections/url.ts";

/** The line that received the picture, as its own webhook knows it. */
export type PictureLine =
  /** A Green API instance: its media files sit under its own instance id. */
  | { provider: "green_api"; instanceId: string }
  /** A Manus line: its gateway serves the media, read with the line's own API key. */
  | { provider: "manus_wa" }
  /** A Meta Cloud API number: the Graph API names the file, read with the line's token. */
  | { provider: "meta_whatsapp" };

/**
 * Green API's media storage. Its shared buckets hold every customer's files, so an address
 * there must also sit under the receiving instance's id; per-instance hosts carry the first
 * four digits of that id.
 */
const GREEN_SHARED_HOSTS: ReadonlyArray<string> = [
  "sw-media-out.storage.yandexcloud.net",
];
const GREEN_INSTANCE_HOSTS: ReadonlyArray<RegExp> = [
  /^(\d{4})\.media\.greenapi\.com$/,
  /^do-media-(\d{4})\.[a-z0-9]+\.digitaloceanspaces\.com$/,
];

/** The Manus WhatsApp gateway that every Manus line in AIOS sends and receives through. */
export const MANUS_MEDIA_HOST = "whatsappgw-pzpyrrww.manus.space";

/** Meta's Graph API, which names a media file, and the host that serves its bytes. */
export const META_GRAPH_HOST = "graph.facebook.com";
const META_MEDIA_HOST = "lookaside.fbsbx.com";

/** Why an address may not be fetched. */
export type PictureUrlProblem =
  | "not_a_url"
  | "not_https"
  | "has_credentials"
  | "private_host"
  | "host_not_allowed"
  | "other_line"
  | "odd_path";

/** Why this address may not be fetched for this line, or null when it may. */
export function pictureUrlProblem(
  raw: string,
  line: PictureLine,
): PictureUrlProblem | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return "not_a_url";
  }
  if (url.protocol !== "https:" || url.port !== "") {
    return "not_https";
  }
  if (url.username || url.password) {
    return "has_credentials";
  }
  if (isPrivateHost(url.hostname)) {
    return "private_host";
  }
  // A server may decode these after the folder check: `/<own id>/..%2F<other id>/…`.
  if (/%2f|%5c|%2e|\\/i.test(url.pathname)) {
    return "odd_path";
  }

  return hostProblem(url, line);
}

/** Whether the host is the provider's own media host for this line. */
function hostProblem(url: URL, line: PictureLine): PictureUrlProblem | null {
  const host = url.hostname.toLowerCase();

  if (line.provider === "manus_wa") {
    return host === MANUS_MEDIA_HOST ? null : "host_not_allowed";
  }
  if (line.provider === "meta_whatsapp") {
    return host === META_GRAPH_HOST || host === META_MEDIA_HOST
      ? null
      : "host_not_allowed";
  }
  return greenHostProblem(url, host, line.instanceId);
}

/**
 * A Green API address: one of its media hosts, a per-instance host of this instance, and a
 * file under this instance's id (`/<id>/…` or `/waInstance<id>/…`).
 */
function greenHostProblem(
  url: URL,
  host: string,
  instanceId: string,
): PictureUrlProblem | null {
  const instance = GREEN_INSTANCE_HOSTS.map((pattern) =>
    pattern.exec(host),
  ).find(Boolean);
  if (!instance && !GREEN_SHARED_HOSTS.includes(host)) {
    return "host_not_allowed";
  }
  if (!/^\d{6,}$/.test(instanceId)) {
    return "other_line";
  }
  const ownPrefix = !instance || instanceId.startsWith(instance[1]);
  const firstFolder = url.pathname.split("/")[1] ?? "";
  const ownFolder =
    firstFolder === instanceId || firstFolder === `waInstance${instanceId}`;

  return ownPrefix && ownFolder ? null : "other_line";
}
