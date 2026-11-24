// Where a Google connect flow may send the user back to. The origin comes from
// the browser at authorize time; only the AIOS app's own hosts are accepted,
// so a callback can never redirect or post a message to another site.

/** Production, Staging and this project's Vercel deployments (team `aios-crm`, project `after-lead`). */
const APP_HOSTS =
  /^(?:(?:www\.|staging\.)?aios\.co\.il|after-lead(?:-[a-z0-9-]+)?-aios-crm\.vercel\.app)$/;

/** Local development. */
const LOCAL_HOSTS = /^(?:localhost|127\.0\.0\.1)$/;

/** Production, used when neither the state nor APP_URL names an app origin. */
const DEFAULT_APP_ORIGIN = "https://aios.co.il";

/** The value's origin when it is the AIOS app, else null. */
export function allowedAppOrigin(
  value: string | null | undefined,
): string | null {
  if (!value || !URL.canParse(value)) {
    return null;
  }

  const url = new URL(value);
  const isApp = url.protocol === "https:" && APP_HOSTS.test(url.hostname);
  const isLocal = url.protocol === "http:" && LOCAL_HOSTS.test(url.hostname);

  return isApp || isLocal ? url.origin : null;
}

/** The app origin to return to: the given one when allowed, else APP_URL, else Production. */
export function appReturnOrigin(origin: string | null): string {
  return (
    allowedAppOrigin(origin) ??
    allowedAppOrigin(Deno.env.get("APP_URL")) ??
    DEFAULT_APP_ORIGIN
  );
}
