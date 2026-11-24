/** Keep credentials in headers, including when Meta returns token-bearing pagination URLs. */
export function fetchMetaDiscovery(
  address: string,
  accessToken: string,
): Promise<Response> {
  const url = new URL(address);
  if (
    url.origin !== "https://graph.facebook.com" ||
    url.username ||
    url.password
  ) {
    console.warn("[Meta discovery] refused pagination origin");
    throw new Error("Invalid Meta discovery URL");
  }
  url.searchParams.delete("access_token");
  url.searchParams.delete("appsecret_proof");
  return fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
}
