import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useQueryClient } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { Tables } from "@/integrations/supabase/types";
import { withTestQuery } from "@/test/withTestQuery";
import Automations from "./Automations";

describe("automation log timestamps", () => {
  it.each([
    { timestamp: null, instant: 0 },
    { timestamp: "1970-01-01T00:00:00Z", instant: 0 },
    { timestamp: "2024-02-29T12:34:56Z", instant: "2024-02-29T12:34:56Z" },
    { timestamp: "2024-03-29T03:00:00+03:00", instant: "2024-03-29T00:00:00Z" },
    { timestamp: "0", instant: "2000-01-01T00:00:00" },
    { timestamp: "", instant: NaN },
    { timestamp: "not-a-date", instant: NaN },
  ])(
    "preserves the log table display for $timestamp",
    async ({ timestamp, instant }) => {
      const user = userEvent.setup();
      render(
        withTestQuery(
          <MemoryRouter>
            <SeededPage timestamp={timestamp} />
          </MemoryRouter>,
        ),
      );

      await user.click(screen.getByRole("button", { name: "לוגים" }));

      expect(
        await screen.findByRole("cell", {
          name: new Date(instant).toLocaleString("he-IL"),
        }),
      ).toBeInTheDocument();
    },
  );
});

/** Seed actual query results so the test exercises the page's log dialog. */
function SeededPage({
  timestamp,
}: {
  timestamp: Tables<"automation_logs">["triggered_at"];
}) {
  const client = useQueryClient();
  client.setQueryDefaults(["automation-logs"], {
    staleTime: Infinity,
    gcTime: Infinity,
  });
  const automation: Tables<"automations"> = {
    id: "automation-1",
    name: "Date display",
    action_type: "notification",
    active: false,
    conditions: null,
    configuration: {},
    created_at: null,
    description: null,
    is_flow: false,
    source_automation_id: null,
    source_tenant_id: null,
    tenant_id: "tenant-1",
    trigger_type: "lead_created",
    updated_at: null,
  };
  const log: Tables<"automation_logs"> = {
    id: "log-1",
    automation_id: automation.id,
    triggered_at: timestamp,
    success: true,
    error_message: null,
    execution_time_ms: 0,
    payload: null,
    response: null,
  };
  client.setQueryData(["automations", null], [automation]);
  client.setQueryData(["automation-logs", automation.id], [log]);
  return <Automations />;
}

vi.mock("@/hooks/useCurrentTenant", () => ({
  useCurrentTenant: () => ({ tenantId: null }),
}));
vi.mock("@/hooks/useTenantPath", () => ({
  useTenantPath: () => ({ buildPath: (path: string) => path }),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => {
      throw new Error("Unexpected database request");
    }),
  },
}));
vi.mock("@/components/forms/AddAutomationForm", () => ({
  AddAutomationForm: () => null,
}));
vi.mock("@/components/forms/EditAutomationDialog", () => ({
  EditAutomationDialog: () => null,
}));
vi.mock("@/components/forms/TestAutomationDialog", () => ({
  TestAutomationDialog: () => null,
}));
vi.mock("@/components/automations/ShareAutomationDialog", () => ({
  ShareAutomationDialog: () => null,
}));
vi.mock("@/components/sharing/CloneToOrgDialog", () => ({
  CloneToOrgDialog: () => null,
}));
