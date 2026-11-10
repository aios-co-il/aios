import { assertEquals } from "jsr:@std/assert@1";
import { automationStepConfigurationSchema } from "./automation-step-configuration.ts";

Deno.test(
  "automation configuration retains phone transforms and nested recipient variants",
  () => {
    assertEquals(
      automationStepConfigurationSchema.parse({
        allowed_phones: ["972501234567", null, 5, ""],
        carmen_allowed_group_ids: ["group", 2],
        hour: 9,
        minute: "30",
        email_recipients: [
          { type: "contact_lookup", entity: "client", id: "client" },
        ],
        custom_fields: [{ field_id: 3, value_template: "{{name}}" }],
      }),
      {
        allowed_phones: ["972501234567", ""],
        carmen_allowed_group_ids: ["group"],
        hour: 9,
        minute: "30",
        email_recipients: [
          { type: "contact_lookup", entity: "client", id: "client" },
        ],
        custom_fields: [{ field_id: 3, value_template: "{{name}}" }],
      },
    );
  },
);

Deno.test(
  "automation configuration keeps its strict unknown-field rejection",
  () => {
    const result = automationStepConfigurationSchema.safeParse({
      message: "hello",
      unrecognized: true,
    });
    assertEquals(result.success, false);
    if (!result.success) {
      assertEquals(
        result.error.issues.map((issue) => issue.code),
        ["unrecognized_keys"],
      );
    }
  },
);
