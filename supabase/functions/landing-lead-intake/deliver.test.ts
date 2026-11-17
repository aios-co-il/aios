import { assertEquals } from "jsr:@std/assert";
import {
  deliverLead,
  type DeliveryDeps,
  type DeliveryResult,
} from "./deliver.ts";
import type { LandingPage } from "./landing-page.ts";
import type { LandingLead } from "./parse-lead.ts";

const lead: LandingLead = {
  subdomain: "acme",
  slug: "home",
  name: "Dana Levi",
  phone: "050-1234567",
  email: null,
};

function pageWith(leadToCrm: boolean, leadToWebhook: boolean): LandingPage {
  return {
    id: "page-1",
    tenantId: "tenant-1",
    clientId: "client-1",
    subdomain: "acme",
    slug: "home",
    title: "Acme home",
    leadToCrm,
    leadToWebhook,
  };
}

interface Call {
  url: string;
  body: Record<string, unknown>;
  secret: string | null;
}

/** Deps whose fetch answers by URL and records every call and the finished result. */
function fakeDeps(
  options: { webhookUrl?: string | null; failing?: Array<string> } = {},
) {
  const calls: Array<Call> = [];
  const finished: Array<DeliveryResult> = [];
  const deps: DeliveryDeps = {
    store: {
      record: () => Promise.resolve("lead-1"),
      finish: (_page, _id, result) => {
        finished.push(result);
        return Promise.resolve();
      },
      webhookUrl: () =>
        Promise.resolve(
          options.webhookUrl === undefined
            ? "https://hooks.example/abc"
            : options.webhookUrl,
        ),
    },
    fetch: (input, init) => {
      const url = String(input);
      const headers = new Headers(init?.headers);
      calls.push({
        url,
        body: JSON.parse(String(init?.body)),
        secret: headers.get("x-webhook-secret"),
      });
      const failed = (options.failing ?? []).some((part) => url.includes(part));
      return Promise.resolve(new Response("", { status: failed ? 500 : 200 }));
    },
    supabaseUrl: "https://aios.example",
    crmIntakeSecret: "s3cret",
  };
  return { deps, calls, finished };
}

Deno.test("deliverLead", async (t) => {
  await t.step(
    "a webhook page gets exactly page_name, name and phone",
    async () => {
      const { deps, calls, finished } = fakeDeps();
      assertEquals(
        await deliverLead(pageWith(false, true), lead, deps),
        "delivered",
      );
      assertEquals(calls.length, 1);
      assertEquals(calls[0].url, "https://hooks.example/abc");
      assertEquals(calls[0].body, {
        page_name: "Acme home",
        name: "Dana Levi",
        phone: "050-1234567",
      });
      assertEquals(finished, [{ crm: "skipped", webhook: "sent", errors: [] }]);
    },
  );

  await t.step(
    "a CRM page creates a lead for the page's org and client",
    async () => {
      const { deps, calls, finished } = fakeDeps();
      assertEquals(
        await deliverLead(pageWith(true, false), lead, deps),
        "delivered",
      );
      assertEquals(calls.length, 1);
      assertEquals(
        calls[0].url,
        "https://aios.example/functions/v1/webhook-lead-intake",
      );
      assertEquals(calls[0].secret, "s3cret");
      assertEquals(calls[0].body.tenant_id, "tenant-1");
      assertEquals(calls[0].body.client_id, "client-1");
      assertEquals(calls[0].body.crm_intake, true);
      assertEquals(calls[0].body.source, "landing_page");
      assertEquals(finished, [{ crm: "sent", webhook: "skipped", errors: [] }]);
    },
  );

  await t.step("a page with both destinations sends to both", async () => {
    const { deps, calls } = fakeDeps();
    assertEquals(
      await deliverLead(pageWith(true, true), lead, deps),
      "delivered",
    );
    assertEquals(calls.length, 2);
  });

  await t.step(
    "one failed destination is recorded and the lead still counts as delivered",
    async () => {
      const { deps, finished } = fakeDeps({ failing: ["hooks.example"] });
      assertEquals(
        await deliverLead(pageWith(true, true), lead, deps),
        "delivered",
      );
      assertEquals(finished, [
        {
          crm: "sent",
          webhook: "failed",
          errors: ["webhook: webhook answered 500"],
        },
      ]);
    },
  );

  await t.step("every destination failing is a failure", async () => {
    const { deps, finished } = fakeDeps({
      failing: ["hooks.example", "webhook-lead-intake"],
    });
    assertEquals(await deliverLead(pageWith(true, true), lead, deps), "failed");
    assertEquals(finished[0].crm, "failed");
    assertEquals(finished[0].webhook, "failed");
  });

  await t.step(
    "a webhook page without a stored URL fails instead of sending nowhere",
    async () => {
      const { deps, calls, finished } = fakeDeps({ webhookUrl: null });
      assertEquals(
        await deliverLead(pageWith(false, true), lead, deps),
        "failed",
      );
      assertEquals(calls.length, 0);
      assertEquals(finished[0].errors, [
        "webhook: the page has no webhook URL",
      ]);
    },
  );

  await t.step(
    "a page with no destination keeps the lead and sends nothing",
    async () => {
      const { deps, calls, finished } = fakeDeps();
      assertEquals(
        await deliverLead(pageWith(false, false), lead, deps),
        "not_configured",
      );
      assertEquals(calls.length, 0);
      assertEquals(finished[0].errors, ["the page has no lead destination"]);
    },
  );
});
