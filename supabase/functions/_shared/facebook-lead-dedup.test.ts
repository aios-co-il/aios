import {
  assertEquals,
  assertNotStrictEquals,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import {
  claimFacebookLeadAutomationRun,
  claimFacebookLeadIntake,
  claimFacebookLeadWhatsAppSend,
  claimIdenticalWhatsAppSend,
  facebookFlowEventSource,
  facebookIntakeEventSource,
  facebookTriggerAutomationSucceeded,
  shouldCreateCrmLeadForFacebookFlow,
  shouldCreateCrmLeadForFacebookFlowConfig,
  facebookWhatsAppSendSource,
  hashWhatsAppBody,
  releaseFacebookLeadAutomationRun,
  releaseFacebookLeadWhatsAppSend,
  shouldLockWhatsAppBody,
  whatsAppBodyEventSource,
  type FacebookLeadDedupDb,
  type LeadEventsTable,
} from "./facebook-lead-dedup.ts";

/** Fake client whose every table is `lead_notification_events`; unlisted calls throw. */
function eventsDb(
  overrides: Partial<LeadEventsTable>,
  onFrom: (table: string) => void = () => {},
): FacebookLeadDedupDb {
  const table: LeadEventsTable = {
    insert: () => {
      throw new Error("unexpected insert");
    },
    select: () => {
      throw new Error("unexpected select");
    },
    delete: () => {
      throw new Error("unexpected delete");
    },
    ...overrides,
  };
  return {
    from: (name: string) => {
      onFrom(name);
      return table;
    },
  };
}

Deno.test(
  "facebookIntakeEventSource is a single shared webhook/poll lock",
  () => {
    assertStrictEquals(facebookIntakeEventSource(), "fb-intake");
  },
);

Deno.test(
  "claimFacebookLeadIntake treats unique violations as duplicates",
  async () => {
    const result = await claimFacebookLeadIntake(
      eventsDb({ insert: async () => ({ error: { code: "23505" } }) }),
      {
        tenantId: "2dcdaac6-41bf-42cc-86bf-9a0b4b2e6019",
        leadgenId: "1614307953752490",
        formId: "2804363709904461",
      },
    );
    assertStrictEquals(result.duplicate, true);
    assertStrictEquals(result.inserted, false);
  },
);

Deno.test("facebookFlowEventSource is unique per automation", () => {
  assertStrictEquals(
    facebookFlowEventSource("82858e4b-3daa-41ed-9b50-5045769b2115"),
    "fb-flow:82858e4b-3daa-41ed-9b50-5045769b2115",
  );
  assertNotStrictEquals(
    facebookFlowEventSource("82858e4b-3daa-41ed-9b50-5045769b2115"),
    facebookFlowEventSource("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"),
  );
});

Deno.test(
  "claimFacebookLeadAutomationRun treats unique violations as duplicates",
  async () => {
    const supabase = eventsDb({
      insert: async () => ({ error: { code: "23505", message: "duplicate" } }),
    });
    const result = await claimFacebookLeadAutomationRun(supabase, {
      tenantId: "2dcdaac6-41bf-42cc-86bf-9a0b4b2e6019",
      automationId: "82858e4b-3daa-41ed-9b50-5045769b2115",
      leadgenId: "874979795580881",
    });
    assertStrictEquals(result.duplicate, true);
    assertStrictEquals(result.inserted, false);
  },
);

Deno.test(
  "claimFacebookLeadAutomationRun reports inserted on success",
  async () => {
    const supabase = eventsDb({ insert: async () => ({ error: null }) });
    const result = await claimFacebookLeadAutomationRun(supabase, {
      tenantId: "2dcdaac6-41bf-42cc-86bf-9a0b4b2e6019",
      automationId: "82858e4b-3daa-41ed-9b50-5045769b2115",
      leadgenId: "874979795580881",
    });
    assertStrictEquals(result.duplicate, false);
    assertStrictEquals(result.inserted, true);
  },
);

Deno.test(
  "claimFacebookLeadAutomationRun treats 409 and unique-constraint text as duplicates",
  async () => {
    const byCode = await claimFacebookLeadAutomationRun(
      eventsDb({
        insert: async () => ({ error: { code: "409", message: "Conflict" } }),
      }),
      {
        tenantId: "2dcdaac6-41bf-42cc-86bf-9a0b4b2e6019",
        automationId: "82858e4b-3daa-41ed-9b50-5045769b2115",
        leadgenId: "874979795580881",
      },
    );
    assertStrictEquals(byCode.duplicate, true);

    const byText = await claimFacebookLeadAutomationRun(
      eventsDb({
        insert: async () => ({
          error: { message: "duplicate key value violates unique constraint" },
        }),
      }),
      {
        tenantId: "2dcdaac6-41bf-42cc-86bf-9a0b4b2e6019",
        automationId: "82858e4b-3daa-41ed-9b50-5045769b2115",
        leadgenId: "874979795580881",
      },
    );
    assertStrictEquals(byText.duplicate, true);
  },
);

Deno.test(
  "facebookWhatsAppSendSource normalizes Israeli phone variants",
  () => {
    assertStrictEquals(
      facebookWhatsAppSendSource("972546684466@c.us"),
      "fb-wa:972546684466@c.us",
    );
    assertStrictEquals(
      facebookWhatsAppSendSource("972546684466"),
      facebookWhatsAppSendSource("0546684466"),
    );
    assertStrictEquals(
      facebookWhatsAppSendSource("0546684466"),
      "fb-wa:972546684466@c.us",
    );
    assertStrictEquals(
      facebookWhatsAppSendSource("120363123456789012@g.us"),
      "fb-wa:120363123456789012@g.us",
    );
  },
);

Deno.test(
  "claimFacebookLeadWhatsAppSend treats unique violations as duplicates",
  async () => {
    const result = await claimFacebookLeadWhatsAppSend(
      eventsDb({ insert: async () => ({ error: { code: "23505" } }) }),
      {
        tenantId: "2dcdaac6-41bf-42cc-86bf-9a0b4b2e6019",
        chatId: "972546684466@c.us",
        leadgenId: "1756054335601891",
      },
    );
    assertStrictEquals(result.duplicate, true);
    assertStrictEquals(result.inserted, false);
  },
);

Deno.test(
  "claimFacebookLeadWhatsAppSend reports inserted on success",
  async () => {
    const result = await claimFacebookLeadWhatsAppSend(
      eventsDb({ insert: async () => ({ error: null }) }),
      {
        tenantId: "2dcdaac6-41bf-42cc-86bf-9a0b4b2e6019",
        chatId: "0546684466",
        leadgenId: "1756054335601891",
      },
    );
    assertStrictEquals(result.duplicate, false);
    assertStrictEquals(result.inserted, true);
  },
);

/** Records the delete filter and the table it ran against. */
function deleteRecorder() {
  const filters: Array<[string, string]> = [];
  const tables: string[] = [];
  const db = eventsDb(
    {
      delete: () => ({
        match: async (filter) => {
          filters.push(...Object.entries(filter));
          return { error: null };
        },
      }),
    },
    (table) => tables.push(table),
  );
  return { db, filters, tables };
}

Deno.test(
  "releaseFacebookLeadWhatsAppSend deletes the owned send receipt",
  async () => {
    const { db, filters, tables } = deleteRecorder();
    await releaseFacebookLeadWhatsAppSend(db, {
      tenantId: "2dcdaac6-41bf-42cc-86bf-9a0b4b2e6019",
      chatId: "0546684466",
      leadgenId: "1756054335601891",
    });
    assertEquals(tables, ["lead_notification_events"]);
    assertEquals(filters, [
      ["tenant_id", "2dcdaac6-41bf-42cc-86bf-9a0b4b2e6019"],
      ["source", "fb-wa:972546684466@c.us"],
      ["external_id", "1756054335601891"],
    ]);
  },
);

Deno.test(
  "claimFacebookLeadAutomationRun skips empty leadgen ids",
  async () => {
    let called = false;
    const supabase = eventsDb({ insert: async () => ({ error: null }) }, () => {
      called = true;
    });
    const result = await claimFacebookLeadAutomationRun(supabase, {
      tenantId: "2dcdaac6-41bf-42cc-86bf-9a0b4b2e6019",
      automationId: "82858e4b-3daa-41ed-9b50-5045769b2115",
      leadgenId: "  ",
    });
    assertStrictEquals(result.duplicate, false);
    assertStrictEquals(result.inserted, false);
    assertStrictEquals(called, false);
  },
);

Deno.test(
  "releaseFacebookLeadAutomationRun deletes the owned claim row",
  async () => {
    const { db, filters, tables } = deleteRecorder();
    await releaseFacebookLeadAutomationRun(db, {
      tenantId: "2dcdaac6-41bf-42cc-86bf-9a0b4b2e6019",
      automationId: "82858e4b-3daa-41ed-9b50-5045769b2115",
      leadgenId: "874979795580881",
    });
    assertEquals(tables, ["lead_notification_events"]);
    assertEquals(filters, [
      ["tenant_id", "2dcdaac6-41bf-42cc-86bf-9a0b4b2e6019"],
      ["source", "fb-flow:82858e4b-3daa-41ed-9b50-5045769b2115"],
      ["external_id", "874979795580881"],
    ]);
  },
);

Deno.test(
  "whatsAppBodyEventSource follows the same chat normalization as send locks",
  () => {
    assertStrictEquals(
      whatsAppBodyEventSource("0546684466"),
      "wa-body:972546684466@c.us",
    );
    assertStrictEquals(
      whatsAppBodyEventSource("972546684466@c.us"),
      "wa-body:972546684466@c.us",
    );
  },
);

Deno.test(
  "shouldLockWhatsAppBody locks Facebook leads and ליד חדש templates",
  () => {
    assertStrictEquals(shouldLockWhatsAppBody("שלום", null), false);
    assertStrictEquals(
      shouldLockWhatsAppBody("שלום", "1384758217138329"),
      true,
    );
    assertStrictEquals(
      shouldLockWhatsAppBody("ליד חדש סקווש:\nשם:Gabriela", null),
      true,
    );
  },
);

Deno.test("hashWhatsAppBody is stable for the same text", async () => {
  const first = await hashWhatsAppBody("ליד חדש סקווש:\nשם:Gabriela");
  const second = await hashWhatsAppBody("ליד חדש סקווש:\nשם:Gabriela");
  const other = await hashWhatsAppBody("ליד חדש סקווש:\nשם:שירה");
  assertStrictEquals(first.length, 64);
  assertStrictEquals(first, second);
  assertNotStrictEquals(first, other);
});

Deno.test(
  "claimIdenticalWhatsAppSend treats unique violations as duplicates",
  async () => {
    const result = await claimIdenticalWhatsAppSend(
      eventsDb({ insert: async () => ({ error: { code: "23505" } }) }),
      {
        tenantId: "2dcdaac6-41bf-42cc-86bf-9a0b4b2e6019",
        chatId: "972546684466@c.us",
        message: "ליד חדש סקווש:\nשם:Gabriela Tajch\nטלפון:+972547905458",
      },
    );
    assertStrictEquals(result.duplicate, true);
    assertStrictEquals(result.inserted, false);
  },
);

Deno.test(
  "facebookTriggerAutomationSucceeded requires a successful inner result",
  () => {
    assertStrictEquals(facebookTriggerAutomationSucceeded(null), false);
    assertStrictEquals(
      facebookTriggerAutomationSucceeded({
        success: true,
        results: [{ skipped: true, reason: "duplicate_facebook_leadgen" }],
      }),
      false,
    );
    assertStrictEquals(
      facebookTriggerAutomationSucceeded({
        success: true,
        results: [{ success: false, error: "Green API timeout" }],
      }),
      false,
    );
    assertStrictEquals(
      facebookTriggerAutomationSucceeded({
        success: true,
        results: [
          {
            success: true,
            automation_id: "82858e4b-3daa-41ed-9b50-5045769b2115",
          },
        ],
      }),
      true,
    );
  },
);

Deno.test(
  "shouldCreateCrmLeadForFacebookFlowConfig skips CRM for WhatsApp-only flows",
  () => {
    const squashTrigger = {
      lead_source: "facebook_form",
      facebook_form_id: "2804363709904461",
      facebook_integration_id: "1d250a3d-7515-4d85-85d6-c4a8581f8b62",
    };
    assertStrictEquals(
      shouldCreateCrmLeadForFacebookFlowConfig(
        squashTrigger,
        "lead_created",
        false,
      ),
      false,
    );
    assertStrictEquals(
      shouldCreateCrmLeadForFacebookFlowConfig(
        squashTrigger,
        "lead_created",
        true,
      ),
      true,
    );
    assertStrictEquals(
      shouldCreateCrmLeadForFacebookFlowConfig(
        { ...squashTrigger, create_crm_lead: true },
        "lead_created",
        false,
      ),
      true,
    );
    assertStrictEquals(
      shouldCreateCrmLeadForFacebookFlowConfig(
        {},
        "inbound_webhook_lead",
        true,
      ),
      false,
    );
  },
);

Deno.test(
  "shouldCreateCrmLeadForFacebookFlow skips the step lookup without an automation id",
  async () => {
    const tables: string[] = [];
    const db = eventsDb({}, (name) => tables.push(name));
    const config = { create_crm_lead: true };
    assertStrictEquals(
      await shouldCreateCrmLeadForFacebookFlow(db, "", config, "facebook_lead"),
      shouldCreateCrmLeadForFacebookFlowConfig(config, "facebook_lead", false),
    );
    assertEquals(tables, []);
  },
);
