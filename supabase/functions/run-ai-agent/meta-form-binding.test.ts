import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing@1/bdd";
import { connectMetaFormToAutomation } from "./meta-form-binding.ts";
import {
  setup,
  automation,
  form,
  configuration,
} from "./meta-form-binding.test-fixture.ts";

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
      pages: [
        null,
        { id: "valid", access_token: "fixture" },
        { id: "invalid", access_token: {} },
      ],
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

  it("does not create a fields alias or an empty field_mappings key", async () => {
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
    const { db, writes } = setup({}, configuration, { failMapping: true });
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
  it("refuses another tenant's integration without updating the trigger", async () => {
    const { db, writes } = setup({}, configuration, {
      integrationTenantId: "other-tenant",
    });
    await assertRejects(
      () => connectMetaFormToAutomation(db, automation, form),
      Error,
      "אינה שייכת",
    );
    assertEquals(writes(), []);
  });

  it("surfaces both rollback causes and logs them without leaking secrets", async () => {
    const { db, writes } = setup({}, configuration, {
      failMapping: true,
      failRollback: true,
      mappingMessage: "Mapping write failed api_key=private-mapping",
      rollbackMessage: "Rollback write failed access_token=private-rollback",
    });
    const logs: Array<unknown> = [];
    const originalError = console.error;
    console.error = (...args: Array<unknown>) => {
      logs.push(args);
    };
    try {
      const failure = await assertRejects(
        () => connectMetaFormToAutomation(db, automation, form),
        AggregateError,
        "Mapping write failed api_key=[redacted]",
      );
      assertEquals(
        failure.message.includes(
          "Rollback write failed access_token=[redacted]",
        ),
        true,
      );
      assertEquals(
        /private-mapping|private-rollback/.test(failure.message),
        false,
      );
    } finally {
      console.error = originalError;
    }
    assertEquals(writes().length, 3);
    assertEquals(logs, [
      [
        "[Meta form binding] trigger rollback failed",
        {
          automationId: automation.id,
          stepId: "step-1",
          mappingError: {
            code: "XX000",
            message: "Mapping write failed api_key=[redacted]",
          },
          rollbackError: {
            code: "XX000",
            message: "Rollback write failed access_token=[redacted]",
          },
        },
      ],
    ]);
  });
});
