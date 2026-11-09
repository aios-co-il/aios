import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing@1/bdd";
import { createClient } from "npm:@supabase/supabase-js@2.75.0";
import type { Database } from "../_shared/database.types.ts";
import { fakeSupabaseHttp } from "../_shared/testing/fake-supabase-http.ts";
import { readMetaLeadSettings } from "./meta-lead-settings.ts";
import {
  connectMetaFormToAutomation,
  type MetaLeadForm,
} from "./meta-form-binding.ts";

const automation = {
  id: "automation-1",
  name: "New leads",
  active: true,
  tenant_id: "tenant-1",
};
const form: MetaLeadForm = {
  id: "form-1",
  name: "New form",
  status: "ACTIVE",
  fields: [{ key: "email", label: "Email", type: "EMAIL" }],
  page_id: "page-1",
  page_name: "Page",
  integration_id: "integration-1",
};
const configuration = {
  lead_source: "any",
  facebook_form_id: "old-form",
  conditions: { source: ["facebook"] },
};

describe("connecting a Meta form with validated persisted settings", () => {
  it("writes metadata while preserving canonical field mappings and unrelated routing", async () => {
    const mapping = {
      field_mappings: { email: "email", full_name: "contact_name" },
      agency_id: "agency-1",
      sales_person_ids: ["salesperson-1"],
      create_crm_lead: false,
      custom_routing: { retain: true },
    };
    const settings = {
      form_mappings: {
        "form-1": mapping,
        "other-form": { client_id: "other-client" },
      },
      page_subscriptions: { "other-page": true },
    };
    const { db, writes } = setup(settings);
    await connectMetaFormToAutomation(db, automation, form);
    assertEquals(
      writes().map((call) => call.body),
      [
        {
          configuration: {
            ...configuration,
            lead_source: "facebook_form",
            facebook_integration_id: form.integration_id,
            facebook_page_id: form.page_id,
            facebook_page_name: form.page_name,
            facebook_form_id: form.id,
            facebook_form_name: form.name,
            facebook_form_fields: form.fields,
          },
        },
        {
          settings: {
            ...settings,
            form_mappings: {
              ...settings.form_mappings,
              "form-1": {
                ...mapping,
                form_name: form.name,
                page_id: form.page_id,
                page_name: form.page_name,
              },
            },
          },
        },
      ],
    );
    for (const call of writes()) {
      assertEquals(call.url.searchParams.get("tenant_id"), "eq.tenant-1");
    }
  });

  it("does not create a fields alias or suppress the webhook's default field mapping", async () => {
    const { db, writes } = setup(null);
    await connectMetaFormToAutomation(db, automation, form);
    const body = writes()[1].body;
    assertEquals(body, {
      settings: {
        form_mappings: {
          "form-1": {
            form_name: form.name,
            page_id: form.page_id,
            page_name: form.page_name,
            agency_id: null,
            sales_person_ids: [],
          },
        },
      },
    });
    const mapping = readMetaLeadSettings(
      body && typeof body === "object" && "settings" in body
        ? body.settings
        : undefined,
    ).form_mappings?.[form.id];
    assertEquals(
      mapping?.field_mappings || {
        full_name: "contact_name",
        email: "email",
        phone_number: "phone",
      },
      { full_name: "contact_name", email: "email", phone_number: "phone" },
    );
  });

  it("rejects invalid integration settings or trigger configuration before any writes", async () => {
    for (const input of [
      {
        settings: {
          form_mappings: { "form-1": { field_mappings: { email: 42 } } },
        },
        config: configuration,
      },
      { settings: {}, config: { lead_source: {} } },
    ]) {
      const { db, writes } = setup(input.settings, input.config);
      await assertRejects(
        () => connectMetaFormToAutomation(db, automation, form),
        Error,
        "Invalid",
      );
      assertEquals(writes(), []);
    }
  });

  it("restores the original trigger when saving the integration mapping fails", async () => {
    const { db, writes } = setup({}, configuration, true);
    const failure = await connectMetaFormToAutomation(
      db,
      automation,
      form,
    ).catch((error: unknown) => error);
    assertEquals(failure, { message: "Mapping write failed", code: "XX000" });
    assertEquals(writes().length, 3);
    assertEquals(writes()[2].body, { configuration });
    assertEquals(writes()[2].url.searchParams.get("tenant_id"), "eq.tenant-1");
  });
});

/** Exercise real PostgREST serialization against the repository's HTTP fake. */
function setup(
  settings: unknown,
  config: unknown = configuration,
  failMapping = false,
) {
  const http = fakeSupabaseHttp({
    supabaseUrl: "https://supabase.test",
    tables: {
      automation_flow_steps: [
        {
          id: "step-1",
          automation_id: automation.id,
          tenant_id: automation.tenant_id,
          step_type: "trigger",
          action_type: "lead_created",
          configuration: config,
        },
      ],
      tenant_integrations: [
        { id: form.integration_id, tenant_id: automation.tenant_id, settings },
      ],
    },
  });
  const db = createClient<Database>("https://supabase.test", "test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (input, init) => {
        const response = await http.fetch(input, init);
        const request = new Request(input, init);
        if (
          failMapping &&
          request.method === "PATCH" &&
          new URL(request.url).pathname.endsWith("/tenant_integrations")
        ) {
          return new Response(
            JSON.stringify({ message: "Mapping write failed", code: "XX000" }),
            { status: 400, headers: { "Content-Type": "application/json" } },
          );
        }
        return response;
      },
    },
  });
  return {
    db,
    writes: () => http.calls.filter((call) => call.method === "PATCH"),
  };
}
