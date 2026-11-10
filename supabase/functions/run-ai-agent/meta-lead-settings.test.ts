import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing@1/bdd";
import { readMetaLeadSettings, configuredPages } from "./meta-lead-settings.ts";

describe("persisted Meta lead settings", () => {
  it("retains nested mappings, routing metadata and unowned integration settings", () => {
    const stored = {
      pages: [
        {
          id: "page-1",
          name: null,
          access_token: "token",
          tasks: ["ADVERTISE"],
        },
      ],
      form_mappings: {
        form1: {
          field_mappings: { email: "email" },
          agency_id: "agency",
          sales_person_ids: null,
          custom_routing: { enabled: true },
          fields: { legacy: "value" },
        },
      },
      page_subscriptions: { "page-1": true },
    };
    assertEquals<unknown>({ ...readMetaLeadSettings(stored) }, stored);
    const settings = readMetaLeadSettings(stored);
    assertEquals(settings.form_mappings?.form1.field_mappings, {
      email: "email",
    });
  });

  it("keeps valid configured pages when neighboring entries are malformed", () => {
    const page = { id: "page-1", name: null, access_token: "token" };
    const stored = { pages: [null, page, { access_token: {} }] };
    const settings = readMetaLeadSettings(stored);
    assertEquals<unknown>(settings.pages, stored.pages);
    assertEquals(configuredPages(settings), [page]);
    assertEquals(readMetaLeadSettings(null), {});
    assertEquals(readMetaLeadSettings(undefined), {});
    assertEquals(readMetaLeadSettings({ pages: null, form_mappings: null }), {
      pages: null,
      form_mappings: null,
    });
  });

  it("rejects malformed mapping fields rather than overwriting them with defaults", () => {
    for (const value of [
      true,
      [],
      "legacy",
      { pages: {} },
      { form_mappings: [] },
      { form_mappings: { form1: { field_mappings: { email: 42 } } } },
      { form_mappings: { form1: { sales_person_ids: [42] } } },
    ]) {
      assertThrows(
        () => readMetaLeadSettings(value),
        Error,
        "Invalid Meta lead settings",
      );
    }
  });
});
