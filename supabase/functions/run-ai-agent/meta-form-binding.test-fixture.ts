import { createClient } from "npm:@supabase/supabase-js@2.75.0";
import type { Database } from "../_shared/database.types.ts";
import { fakeSupabaseHttp } from "../_shared/testing/fake-supabase-http.ts";
import type { MetaLeadForm } from "./meta-form-binding.ts";

/** Exercise real PostgREST serialization against the repository's HTTP fake. */
export function setup(
  settings: unknown,
  config: unknown = configuration,
  options: {
    failMapping?: boolean;
    failRollback?: boolean;
    integrationTenantId?: string;
    mappingMessage?: string;
    rollbackMessage?: string;
  } = {},
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
        {
          id: form.integration_id,
          tenant_id: options.integrationTenantId ?? automation.tenant_id,
          settings,
        },
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
          options.failMapping &&
          request.method === "PATCH" &&
          new URL(request.url).pathname.endsWith("/tenant_integrations")
        ) {
          return new Response(
            JSON.stringify({
              message: options.mappingMessage ?? "Mapping write failed",
              code: "XX000",
            }),
            { status: 400, headers: { "Content-Type": "application/json" } },
          );
        }
        if (
          options.failRollback &&
          request.method === "PATCH" &&
          new URL(request.url).pathname.endsWith("/automation_flow_steps") &&
          http.calls.filter(
            (call) =>
              call.method === "PATCH" &&
              call.url.pathname.endsWith("/automation_flow_steps"),
          ).length === 2
        ) {
          return new Response(
            JSON.stringify({
              message: options.rollbackMessage ?? "Rollback write failed",
              code: "XX000",
            }),
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

export const automation = {
  id: "automation-1",
  name: "New leads",
  active: true,
  tenant_id: "tenant-1",
};
export const form: MetaLeadForm = {
  id: "form-1",
  name: "New form",
  status: "ACTIVE",
  fields: [{ key: "email", label: "Email", type: "EMAIL" }],
  page_id: "page-1",
  page_name: "Page",
  integration_id: "integration-1",
};
export const configuration = {
  lead_source: "any",
  facebook_form_id: "old-form",
  conditions: { source: ["facebook"] },
};
