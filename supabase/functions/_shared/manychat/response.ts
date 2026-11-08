/** Decode provider JSON while preserving bounded diagnostics for non-JSON responses. */
export async function safeJson(res: Response): Promise<unknown> {
  const contentType = res.headers.get("content-type") || "";
  const text = await res.text();
  if (!contentType.includes("application/json")) {
    return { __nonJson: true, status: res.status, text: text.slice(0, 500) };
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    console.warn("[manychat] invalid JSON response", {
      status: res.status,
      error,
    });
    return { __parseError: true, status: res.status, text: text.slice(0, 500) };
  }
}
