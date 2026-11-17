import type { LandingPage } from "./landing-page.ts";
import type { LandingLead } from "./parse-lead.ts";

/** How one destination ended for one lead. */
export type DestinationStatus = "skipped" | "sent" | "failed";

/** What happened to a lead at each destination. */
export interface DeliveryResult {
  crm: DestinationStatus;
  webhook: DestinationStatus;
  errors: Array<string>;
}

/** The lead record and webhook URL a delivery reads and writes. */
export interface LeadStore {
  record(page: LandingPage, lead: LandingLead): Promise<string>;
  finish(
    page: LandingPage,
    leadId: string,
    result: DeliveryResult,
  ): Promise<void>;
  webhookUrl(page: LandingPage): Promise<string | null>;
}

/** What a delivery needs from outside: the store, HTTP, and the CRM intake's address and secret. */
export interface DeliveryDeps {
  store: LeadStore;
  fetch: typeof fetch;
  supabaseUrl: string;
  crmIntakeSecret: string;
}

/** The answer the form gets: delivered somewhere, nowhere to deliver, or every destination failed. */
export type DeliveryOutcome = "delivered" | "not_configured" | "failed";

/**
 * Records the lead, sends it to each destination the page has on, and records how each one ended.
 * One destination that works is enough for the visitor to see success: the failed one is in
 * landing_leads and the logs, and asking the visitor to resend would duplicate the lead at the
 * destination that worked.
 */
export async function deliverLead(
  page: LandingPage,
  lead: LandingLead,
  deps: DeliveryDeps,
): Promise<DeliveryOutcome> {
  const leadId = await deps.store.record(page, lead);
  const where = `${page.subdomain}/${page.slug}`;
  if (!page.leadToCrm && !page.leadToWebhook) {
    const errors = ["the page has no lead destination"];
    await deps.store.finish(page, leadId, {
      crm: "skipped",
      webhook: "skipped",
      errors,
    });
    console.error(
      `landing-lead-intake: ${where} has no lead destination; lead ${leadId} kept`,
    );
    return "not_configured";
  }

  const errors: Array<string> = [];
  const crm = page.leadToCrm
    ? await attempt("crm", errors, () => sendToCrm(page, lead, deps))
    : "skipped";
  const webhook = page.leadToWebhook
    ? await attempt("webhook", errors, () => sendToWebhook(page, lead, deps))
    : "skipped";
  await deps.store.finish(page, leadId, { crm, webhook, errors });

  for (const error of errors) {
    console.error(`landing-lead-intake: ${where} lead ${leadId}: ${error}`);
  }
  return crm === "sent" || webhook === "sent" ? "delivered" : "failed";
}

/** Runs one destination and turns its failure into a status and a recorded reason. */
async function attempt(
  destination: "crm" | "webhook",
  errors: Array<string>,
  send: () => Promise<void>,
): Promise<DestinationStatus> {
  try {
    await send();
    return "sent";
  } catch (error) {
    errors.push(
      `${destination}: ${error instanceof Error ? error.message : "unknown error"}`,
    );
    return "failed";
  }
}

/** Creates the lead in the org's CRM through webhook-lead-intake, tied to the page's client. */
async function sendToCrm(
  page: LandingPage,
  lead: LandingLead,
  deps: DeliveryDeps,
): Promise<void> {
  const response = await deps.fetch(
    `${deps.supabaseUrl}/functions/v1/webhook-lead-intake`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(deps.crmIntakeSecret
          ? { "x-webhook-secret": deps.crmIntakeSecret }
          : {}),
      },
      body: JSON.stringify({
        tenant_id: page.tenantId,
        client_id: page.clientId,
        // Without this flag a payload that names a client is treated as a client alert, not a CRM lead.
        crm_intake: true,
        contact_name: lead.name,
        phone: lead.phone,
        ...(lead.email ? { email: lead.email } : {}),
        source: "landing_page",
        campaign_name: page.title,
        form_data: { landing_page: `${page.subdomain}/${page.slug}` },
      }),
    },
  );
  if (!response.ok) {
    throw new Error(`CRM intake answered ${response.status}`);
  }
}

/** Posts the lead to the page's webhook with the three fields its scenarios expect. */
async function sendToWebhook(
  page: LandingPage,
  lead: LandingLead,
  deps: DeliveryDeps,
): Promise<void> {
  const url = await deps.store.webhookUrl(page);
  if (!url) {
    throw new Error("the page has no webhook URL");
  }
  const response = await deps.fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      page_name: page.title,
      name: lead.name,
      phone: lead.phone,
    }),
  });
  if (!response.ok) {
    throw new Error(`webhook answered ${response.status}`);
  }
}
