// Request handling for broadcast-unsubscribe. No supabase-js imports:
// index.ts wires in the Supabase-backed store, and the tests pass a fake one.
//
// Supabase serves function responses as text/plain, so the confirmation page
// lives in the app (/unsubscribe/:tenantSlug) and this function answers JSON:
//
//   GET  ?r=<id>&info=1        → { ok, tenant_name }; never unsubscribes
//                                 (link previews issue GETs)
//   GET  ?r=<id>               → 302 to the app page (links in mailings sent
//                                 before the page existed)
//   POST { "r": "<id>" } JSON  → unsubscribes; { ok, tenant_name }
//   POST without JSON (?r=)    → unsubscribes; email one-click
//                                 (List-Unsubscribe-Post) from Gmail/Outlook
//
// The public answers carry the organization name only, never the
// recipient's phone, email or name.
import { corsHeaders } from "../_shared/cors.ts";

export interface UnsubscribeStore {
  /** The recipient's tenant, or null when no recipient has this id. */
  tenantOf(recipientId: string): Promise<{ name: string; slug: string } | null>;
  /**
   * Blacklist the recipient's addresses in its own tenant and mark it
   * opted_out. Returns the tenant name, or null when no recipient has this id.
   */
  unsubscribe(recipientId: string): Promise<{ tenantName: string } | null>;
}

export interface UnsubscribeDeps {
  store: UnsubscribeStore;
  /** App origin without a trailing slash (APP_URL). */
  appUrl: string;
}

/** How the caller reads the answer: JSON for the app page, plain otherwise. */
type Reply = {
  json: boolean;
  fail(status: number, error: string, message: string): Response;
};

/** Routes one request; any thrown error becomes a generic 500. */
export async function handleUnsubscribe(
  req: Request,
  deps: UnsubscribeDeps,
): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  const url = new URL(req.url);
  const reply = replyFor(req, url);
  if (req.method !== "GET" && req.method !== "POST") {
    return reply.fail(405, "method_not_allowed", "Method not allowed");
  }
  try {
    const recipientId = await recipientIdOf(req, url, reply.json);
    if (!UUID.test(recipientId)) {
      console.warn("[broadcast-unsubscribe] invalid recipient id");
      return reply.fail(400, "invalid_link", "הקישור אינו תקין.");
    }
    return req.method === "GET"
      ? await answerGet(recipientId, url, reply, deps)
      : await answerPost(recipientId, reply, deps.store);
  } catch (e) {
    console.error("[broadcast-unsubscribe]", e);
    return reply.fail(
      500,
      "internal_error",
      "אירעה שגיאה, נסה/י שוב מאוחר יותר.",
    );
  }
}

/** The app page a recipient confirms the unsubscribe on. */
export function unsubscribePageUrl(
  appUrl: string,
  tenantSlug: string,
  recipientId: string,
) {
  return `${appUrl}/unsubscribe/${encodeURIComponent(tenantSlug)}?r=${recipientId}`;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const NOT_FOUND_TEXT = "הקישור פג או לא נמצא.";

/** GET never unsubscribes: info=1 names the tenant, else redirect to the page. */
async function answerGet(
  recipientId: string,
  url: URL,
  reply: Reply,
  { store, appUrl }: UnsubscribeDeps,
) {
  const tenant = await store.tenantOf(recipientId);
  if (!tenant) {
    return reply.fail(404, "not_found", NOT_FOUND_TEXT);
  }
  if (url.searchParams.has("info")) {
    return json({ ok: true, tenant_name: tenant.name });
  }
  return new Response(null, {
    status: 302,
    headers: {
      ...corsHeaders,
      Location: unsubscribePageUrl(appUrl, tenant.slug, recipientId),
    },
  });
}

/** POST unsubscribes: the app page (JSON) or email one-click (no JSON). */
async function answerPost(
  recipientId: string,
  reply: Reply,
  store: UnsubscribeStore,
) {
  const done = await store.unsubscribe(recipientId);
  if (!done) {
    return reply.fail(404, "not_found", NOT_FOUND_TEXT);
  }
  return reply.json
    ? json({ ok: true, tenant_name: done.tenantName })
    : text("הוסרת בהצלחה – לא יישלחו אליך עוד דיוורים.");
}

/** JSON for `GET ?info` and JSON POSTs; plain text for links and one-click. */
function replyFor(req: Request, url: URL): Reply {
  const contentType = (req.headers.get("content-type") ?? "").toLowerCase();
  const isJson =
    (req.method === "GET" && url.searchParams.has("info")) ||
    (req.method === "POST" && contentType.startsWith("application/json"));
  return {
    json: isJson,
    fail: (status, error, message) =>
      isJson ? json({ ok: false, error }, status) : text(message, status),
  };
}

/** `r` from a JSON POST body, else from the query; "" when absent. */
async function recipientIdOf(req: Request, url: URL, isJson: boolean) {
  if (isJson && req.method === "POST") {
    const body: unknown = await req.json().catch((e) => {
      console.warn("[broadcast-unsubscribe] unreadable JSON body:", e);
      return null;
    });
    if (body && typeof body === "object" && "r" in body) {
      const { r } = body;
      if (typeof r === "string") {
        return r;
      }
    }
  }
  return url.searchParams.get("r") ?? "";
}

/** JSON answer for the app page. */
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Plain answer for links and one-click; Supabase serves it as text anyway. */
function text(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" },
  });
}
