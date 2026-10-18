/** Installed before an Edge entrypoint loads, only by the Staging deployer.
 * Independent of APP_ENV and copied database data. No production opt-out flag.
 */
export function outboundAllowed(url, method, ownOrigin) {
  const target = new URL(url);
  if (target.protocol !== "https:") return false;
  if (target.origin === ownOrigin) {
    // Automated Supabase Auth invitations also send real email.
    return !/^\/auth\/v1\/(invite|recover|signup|resend|otp)(\/|$)/.test(
      target.pathname,
    );
  }
  // Copied integration URLs must never invoke Production services, even with GET.
  if (target.hostname.endsWith(".supabase.co")) return false;
  const verb = method.toUpperCase();
  // Google report connections must be able to refresh their existing tokens.
  // The subsequent API call is still checked separately by this guard.
  if (
    verb === "POST" &&
    target.hostname === "oauth2.googleapis.com" &&
    target.pathname === "/token"
  )
    return true;
  if (
    verb === "POST" &&
    ["www.googleapis.com", "searchconsole.googleapis.com"].includes(
      target.hostname,
    ) &&
    /^\/webmasters\/v3\/sites\/[^/]+\/searchAnalytics\/query$/.test(
      target.pathname,
    )
  )
    return true;
  // Carmen can think and read reports; messaging, publishing and management stay blocked.
  const inference = {
    "api.openai.com":
      /^\/v1\/(responses|chat\/completions|embeddings|audio\/transcriptions|audio\/speech|images\/generations|images\/edits)\/?$/,
    "api.anthropic.com": /^\/v1\/messages\/?$/,
    "api.x.ai": /^\/v1\/(chat\/completions|responses|embeddings)\/?$/,
  };
  if (verb === "POST" && inference[target.hostname]?.test(target.pathname))
    return true;
  const workspaceAgentId =
    "(?:agtch_[a-z0-9]+|[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})";
  const workspaceTriggerPath = new RegExp(
    `^/v1/workspace_agents/${workspaceAgentId}/trigger$`,
    "i",
  );
  const workspaceProbePath = new RegExp(
    `^/v1/workspace_agents/${workspaceAgentId}/?$`,
    "i",
  );
  if (
    target.hostname === "api.chatgpt.com" &&
    ((verb === "POST" && workspaceTriggerPath.test(target.pathname)) ||
      (["GET", "HEAD"].includes(verb) &&
        workspaceProbePath.test(target.pathname)))
  )
    return true;
  if (
    verb === "POST" &&
    target.hostname === "api.cursor.com" &&
    /^\/v0\/agents(?:\/[^/]+\/followup)?$/.test(target.pathname)
  )
    return true;
  // Claude Direct: fire one configured Claude Code routine (no other Anthropic management API).
  if (
    verb === "POST" &&
    target.hostname === "api.anthropic.com" &&
    /^\/v1\/claude_code\/routines\/trig_[A-Za-z0-9]+\/fire$/.test(
      target.pathname,
    )
  )
    return true;
  if (
    verb === "POST" &&
    target.hostname === "googleads.googleapis.com" &&
    /\/googleAds:search(Stream)?$/.test(target.pathname)
  )
    return true;
  if (
    verb === "POST" &&
    target.hostname === "analyticsdata.googleapis.com" &&
    /:(runReport|batchRunReports|runRealtimeReport)$/.test(target.pathname)
  )
    return true;
  if (!["GET", "HEAD"].includes(verb)) return false;
  if (
    ["api.openai.com", "api.anthropic.com", "api.x.ai"].includes(
      target.hostname,
    ) &&
    /^\/v1\/(models(?:\/[^/]+)?|responses\/[^/]+)\/?$/.test(target.pathname)
  )
    return true;
  if (
    target.hostname === "api.cursor.com" &&
    /^\/v0\/agents(?:\/[^/]+(?:\/conversation)?)?\/?$/.test(target.pathname)
  )
    return true;
  // Some providers expose sends as GET. Only explicitly read-only analytics APIs
  // and static assets are allowed; unknown destinations fail closed.
  const readHosts = [
    "graph.facebook.com",
    "googleads.googleapis.com",
    "analyticsdata.googleapis.com",
    "searchconsole.googleapis.com",
    "www.googleapis.com",
    "api.ahrefs.com",
  ];
  if (readHosts.includes(target.hostname)) {
    // Graph API supports method overrides in the query string.
    if (
      ["method", "_method"].some(
        (key) =>
          target.searchParams.has(key) &&
          !["GET", "HEAD"].includes(target.searchParams.get(key).toUpperCase()),
      )
    )
      return false;
    return !/\/(messages|feed|photos|videos)(\/|$)/i.test(target.pathname);
  }
  return [
    "fonts.googleapis.com",
    "fonts.gstatic.com",
    "oaidalleapiprodscus.blob.core.windows.net",
  ].includes(target.hostname);
}

// Staging may deliver WhatsApp test messages to these numbers only (David).
// Hardcoded so copied data or env values cannot widen it. Groups stay blocked.
export const STAGING_WHATSAPP_TEST_NUMBERS = ["972507677613"];

/** Returns the recipient field name for a reviewed WhatsApp send endpoint, else null. */
export function whatsappSendRecipientField(url, method) {
  if (method.toUpperCase() !== "POST") return null;
  const target = new URL(url);
  if (target.search) return null;
  if (
    target.hostname === "api.green-api.com" &&
    /^\/waInstance\d+\/(sendMessage|sendFileByUrl|sendFileByUpload)\/[^/]+$/.test(
      target.pathname,
    )
  )
    return "chatId";
  // Per-instance upload host: https://{first 4 digits of idInstance}.media.greenapi.com
  const media = /^(\d{4})\.media\.greenapi\.com$/.exec(target.hostname);
  const upload = /^\/waInstance(\d+)\/sendFileByUpload\/[^/]+$/.exec(
    target.pathname,
  );
  if (media && upload && upload[1].startsWith(media[1])) return "chatId";
  if (
    target.hostname === "whatsappgw-pzpyrrww.manus.space" &&
    /^\/api\/v1\/instances\/[^/]+\/send\/(text|image|file)$/.test(
      target.pathname,
    )
  )
    return "to";
  if (
    target.hostname === "graph.facebook.com" &&
    /^\/v\d+(\.\d+)?\/\d+\/messages$/.test(target.pathname)
  )
    return "to";
  return null;
}

/** True only for a direct chat with an exact test number (no groups, no suffix matching). */
export function isStagingWhatsAppTestRecipient(value) {
  if (typeof value !== "string") return false;
  const match = /^\+?(\d+)(@c\.us|@s\.whatsapp\.net)?$/.exec(value.trim());
  return Boolean(match) && STAGING_WHATSAPP_TEST_NUMBERS.includes(match[1]);
}

async function readRecipient(input, init, field) {
  try {
    let body = init?.body;
    if (body === undefined && input instanceof Request)
      body = await input.clone().text();
    if (body instanceof FormData || body instanceof URLSearchParams) {
      const values = body.getAll(field);
      return values.length === 1 ? values[0] : null;
    }
    if (typeof body !== "string") return null;
    const parsed = JSON.parse(body);
    // Meta accepts recipient lists only via "to"; reject any batch/group shape.
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return null;
    if ("groupId" in parsed || "recipients" in parsed) return null;
    return parsed[field];
  } catch {
    return null;
  }
}

export async function stagingRequestAllowed(input, init, origin) {
  const url =
    typeof input === "string" || input instanceof URL
      ? String(input)
      : input.url;
  const method =
    init?.method || (input instanceof Request ? input.method : "GET");
  if (outboundAllowed(url, method, origin)) return true;
  const field = whatsappSendRecipientField(url, method);
  if (!field) return false;
  return isStagingWhatsAppTestRecipient(
    await readRecipient(input, init, field),
  );
}

export function installStagingOutboundGuard(ownUrl, runtime = globalThis) {
  const origin = new URL(ownUrl).origin;
  const originalFetch = runtime.fetch.bind(runtime);
  runtime.fetch = async (input, init) => {
    const url =
      typeof input === "string" || input instanceof URL
        ? String(input)
        : input.url;
    const method =
      init?.method || (input instanceof Request ? input.method : "GET");
    if (!(await stagingRequestAllowed(input, init, origin))) {
      // No recipient, token, body, URL query or client data enters the log.
      console.info("[staging-outbound] blocked", method, new URL(url).hostname);
      return new Response(
        JSON.stringify({
          success: false,
          dry_run: true,
          blocked: true,
          error: "staging_outbound_blocked",
        }),
        { status: 409, headers: { "Content-Type": "application/json" } },
      );
    }
    // Do not let an allowed host redirect a request to an unreviewed destination.
    return originalFetch(input, { ...init, redirect: "error" });
  };
}
