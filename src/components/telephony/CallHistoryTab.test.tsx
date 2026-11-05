import { createClient } from "@supabase/supabase-js";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Database, Tables } from "@/integrations/supabase/types";
import { withTestQuery } from "@/test/withTestQuery";
import { CallHistoryTab } from "./CallHistoryTab";

const context = vi.hoisted((): { duration: number | null } => ({
  duration: null,
}));
const requests: Array<Request> = [];
const client = createClient<Database>("https://example.com", "test-key", {
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    fetch: async (input, init) => {
      requests.push(new Request(input, init));
      const log: Tables<"call_logs"> = {
        id: "call-1",
        tenant_id: "tenant-1",
        caller_user_id: "user-1",
        caller_resolution: null,
        client_id: null,
        lead_id: "lead-1",
        created_at: "2026-11-06T10:00:00",
        updated_at: "2026-11-06T10:00:00",
        duration: context.duration,
        from_number: null,
        to_number: "+15551234567",
        status: "completed",
        notes: null,
        provider: null,
        provider_call_id: null,
        recording_duration: null,
        recording_path: null,
        recording_url: null,
      };
      return new Response(JSON.stringify([log]), {
        headers: { "content-type": "application/json" },
      });
    },
  },
});

vi.mock("@/integrations/supabase/client", () => ({
  get supabase() {
    return client;
  },
}));
vi.mock("@/hooks/useCurrentTenant", () => ({
  useCurrentTenant: () => ({ tenantId: "tenant-1" }),
}));

afterEach(() => {
  cleanup();
  requests.length = 0;
});

describe("CallHistoryTab nullable duration rendering", () => {
  for (const [duration, label] of [
    [null, null],
    [0, null],
    [-1, null],
    [1, "0:01"],
    [125, "2:05"],
  ] satisfies Array<[number | null, string | null]>) {
    it(`preserves the call row for duration ${duration}`, async () => {
      context.duration = duration;
      const { container } = render(
        withTestQuery(<CallHistoryTab leadId="lead-1" />),
      );

      await screen.findByText("+15551234567");
      expect(screen.getByText("הושלם")).toBeInTheDocument();
      expect(screen.getByText("06/11/2026 10:00")).toBeInTheDocument();
      const durationLabel = container.querySelector("span.text-xs.font-mono");
      if (label === null) {
        expect(durationLabel).toBeNull();
      } else {
        expect(durationLabel).toHaveTextContent(label);
      }

      expect(requests).toHaveLength(1);
      const url = new URL(requests[0].url);
      expect(url.pathname).toBe("/rest/v1/call_logs");
      expect(url.searchParams.get("select")).toBe("*");
      expect(url.searchParams.get("tenant_id")).toBe("eq.tenant-1");
      expect(url.searchParams.get("lead_id")).toBe("eq.lead-1");
      expect(url.searchParams.get("order")).toBe("created_at.desc");
    });
  }
});
