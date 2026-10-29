import { afterEach, describe, expect, it, vi } from "vitest";
import type { ClientIntegration } from "@/lib/tenantIntegrationsClient";
import { hasIntegrationId } from "./integrationIdentity";

afterEach(() => vi.restoreAllMocks());

describe("integration selector identities", () => {
  it("keeps valid rows and diagnoses malformed IDs without logging payloads", () => {
    const diagnostic = vi.spyOn(console, "error").mockImplementation(() => {});
    const valid: ClientIntegration = {
      id: "integration-1",
      tenant_id: "tenant-1",
      integration_type: "google_search_console",
      has_credential: false,
    };
    const malformed: ClientIntegration = {
      ...valid,
      id: 42,
      settings: { private_note: "must not appear in diagnostics" },
    };

    expect([valid].filter(hasIntegrationId)).toEqual([valid]);
    expect(diagnostic).not.toHaveBeenCalled();

    expect([malformed, valid].filter(hasIntegrationId)).toEqual([valid]);
    expect(diagnostic).toHaveBeenCalledExactlyOnceWith(
      "Ignoring integration with an invalid id",
    );
  });
});
