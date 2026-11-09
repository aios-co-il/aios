import { assertEquals } from "jsr:@std/assert@1";
import {
  readMarketingWorkItemPayload,
  readAutomationStepSummary,
  readMetaAdSettings,
  readMetaAdAccountBinding,
} from "./tool-storage-contracts.ts";

Deno.test("malformed storage fields cannot escape into tool responses", () => {
  assertEquals(
    readMarketingWorkItemPayload({
      department: { bad: true },
      brief_text: "Brief",
    }),
    {
      department: undefined,
      brief_text: "Brief",
    },
  );
  assertEquals(
    readAutomationStepSummary({
      facebook_form_id: { bad: true },
      facebook_page_id: "page",
      skin_slugs: [123],
    }),
    {
      facebook_form_id: undefined,
      facebook_page_id: "page",
      skin_slugs: undefined,
    },
  );
  assertEquals(readMetaAdSettings({ ad_account_id: { id: "123" } }), {
    ad_account_id: undefined,
  });
  for (const value of [null, undefined, [], "settings"]) {
    assertEquals(readMetaAdSettings(value), {});
    assertEquals(readMarketingWorkItemPayload(value), {});
    assertEquals(readAutomationStepSummary(value), {});
  }
});

Deno.test(
  "typed storage readers retain valid legacy account IDs and summary fields",
  () => {
    assertEquals(readMetaAdSettings({ ad_account_id: 123, unrelated: true }), {
      ad_account_id: 123,
    });
    assertEquals(readMetaAdSettings({ ad_account_id: "act_123" }), {
      ad_account_id: "act_123",
    });
    assertEquals(
      readAutomationStepSummary({
        skin_slugs: ["marketing"],
        agent_id: null,
        facebook_form_id: "form",
        unrelated: true,
      }),
      {
        skin_slugs: ["marketing"],
        agent_id: null,
        facebook_form_id: "form",
      },
    );
  },
);

Deno.test(
  "replacement and health checks retain legacy account bindings",
  () => {
    const settings = { ad_account_id: ["12345"] };
    assertEquals(readMetaAdSettings(settings).ad_account_id, "12345");
    assertEquals(
      readMetaAdSettings({ ad_account_id: [12345] }).ad_account_id,
      12345,
    );
    assertEquals(readMetaAdAccountBinding(settings), "act_12345");
    assertEquals(
      readMetaAdAccountBinding({ ad_account_id: 12345 }),
      "act_12345",
    );
    assertEquals(
      readMetaAdAccountBinding({ ad_account_id: "act_12345" }),
      "act_12345",
    );
    assertEquals(readMetaAdAccountBinding({}), null);
    assertEquals(readMetaAdAccountBinding(null), null);
  },
);
