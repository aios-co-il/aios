import { describe, expect, it } from "vitest";
import { actionConfiguration } from "./automationActionConfiguration";

describe("actionConfiguration", () => {
  it("builds a webhook configuration with defaults", () => {
    expect(
      actionConfiguration({
        action_type: "webhook",
        webhook_url: "https://example.com/hook",
      }),
    ).toEqual({
      url: "https://example.com/hook",
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body_template: "",
    });
  });

  it("adds the status fields and the date field for update_status", () => {
    expect(
      actionConfiguration({
        action_type: "update_status",
        status_entity: "lead",
        status_value: "closed",
        update_field_name: "closed_at",
      }),
    ).toMatchObject({
      entity: "lead",
      status: "closed",
      update_field: "closed_at",
      update_field_value: "today",
    });
    expect(
      actionConfiguration({
        action_type: "update_status",
        status_entity: "task",
        status_value: "done",
        update_field_name: "none",
      }),
    ).not.toHaveProperty("update_field");
  });

  it("fills Green API and task defaults", () => {
    expect(
      actionConfiguration({ action_type: "send_greenapi_message" }),
    ).toEqual({
      message_template: "",
      integration_id: null,
      send_to_type: "contact",
      manual_phone: null,
      manual_group_id: null,
    });
    expect(actionConfiguration({ action_type: "create_task" })).toEqual({
      task_title_template: "{{company_name}} - משימה חדשה",
      task_notes_template: "",
      task_priority: 5,
      task_due_days: 0,
    });
  });

  it("stores no settings for actions without their own", () => {
    expect(actionConfiguration({ action_type: "create_lead" })).toEqual({});
    expect(actionConfiguration({ action_type: "email" })).toEqual({});
  });
});
