import type { SenderDomain } from "@/hooks/useBroadcastDomains";

/** True when the email body has text or an image (an empty editor emits `<p></p>`). */
export function emailBodyHasContent(bodyHtml: string): boolean {
  return (
    bodyHtml.replace(/<[^>]*>|&nbsp;/g, "").trim().length > 0 ||
    /<img\b/i.test(bodyHtml)
  );
}

/** From address and name for an email broadcast: the custom pick or the tenant's default domain. */
export function wizardSender(opts: {
  custom: boolean;
  fromLocal: string;
  fromDomain: string;
  fromName: string;
  defaultDomain: SenderDomain | undefined;
}): { email: string | null; name: string | null } {
  const { custom, fromLocal, fromDomain, fromName, defaultDomain } = opts;
  if (custom) {
    return {
      email: `${fromLocal}@${fromDomain}`,
      name: fromName.trim() || null,
    };
  }
  if (!defaultDomain) {
    return { email: null, name: null };
  }
  return {
    email: `${defaultDomain.default_local}@${defaultDomain.domain}`,
    name: defaultDomain.from_name || null,
  };
}
