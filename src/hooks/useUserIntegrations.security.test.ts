import { expect, test } from "vitest";
import {
  getClientIntegrationSelect,
  toClientIntegration,
} from "../lib/tenantIntegrationsClient.ts";
import {
  isReportTenantScopedIntegration,
  REPORT_TENANT_SCOPED_INTEGRATION_TYPES,
} from "../lib/reportIntegrationTypes.ts";

const GOOGLE_TYPES = [
  "google_ads",
  "google_analytics",
  "google_search_console",
] as const;
const REPORT_TYPES = [
  "google_ads",
  "google_analytics",
  "google_search_console",
  "facebook_lead_ads",
  "ahrefs",
  "tiktok",
] as const;

function assertNoSecrets(payload: unknown, label: string) {
  const json = JSON.stringify(payload);
  expect(!json.includes("ya29."), `${label}: access token leaked`).toBeTruthy();
  expect(
    !json.includes("1//secret"),
    `${label}: refresh token leaked`,
  ).toBeTruthy();
  expect(
    !json.includes('"api_key"'),
    `${label}: api_key field leaked`,
  ).toBeTruthy();
  expect(
    !json.includes("refresh_token"),
    `${label}: refresh_token field leaked`,
  ).toBeTruthy();
}

test("report integration types are tenant-scoped for listing", () => {
  for (const type of REPORT_TYPES) {
    expect(isReportTenantScopedIntegration(type), type).toBe(true);
  }
  expect(isReportTenantScopedIntegration("meta_whatsapp")).toBe(false);
  expect(isReportTenantScopedIntegration("green_api")).toBe(false);
  expect(REPORT_TENANT_SCOPED_INTEGRATION_TYPES.has("facebook")).toBeTruthy();
});

for (const integrationType of GOOGLE_TYPES) {
  test(`useUserIntegrations pipeline strips secrets for ${integrationType}`, () => {
    const select = getClientIntegrationSelect(integrationType);
    expect(
      !select.includes("api_key"),
      `${integrationType} select must omit api_key`,
    ).toBeTruthy();

    const dbRow = {
      id: `int-${integrationType}`,
      tenant_id: "tenant-arba",
      user_id: "user-owner",
      integration_type: integrationType,
      is_active: true,
      api_key: "ya29.super-secret-access-token",
      settings: {
        refresh_token: "1//secret-refresh-token",
        google_email: "ads@arba.co.il",
        connected_at: "2026-01-15T10:00:00Z",
        needs_reauth: false,
        client_sites: { "client-1": "https://example.com/" },
        available_sites: [
          { siteUrl: "https://example.com/", permissionLevel: "siteOwner" },
        ],
      },
      display_name: null,
      connection_visibility: null,
      shared_from_integration_id: null,
      auto_sync_enabled: true,
      last_sync_at: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-15T10:00:00Z",
      instance_id: null,
      company_id: null,
      api_token_last_4: null,
    };

    // Mirrors useUserIntegrations tenant-scoped mapping.
    const clientRows = [
      toClientIntegration(dbRow, { _isOwn: true, _sharedByName: null }),
      toClientIntegration(
        { ...dbRow, id: `shared-${integrationType}`, user_id: "other-user" },
        { _isOwn: false, _sharedByName: "David" },
      ),
    ];

    expect(clientRows[0].has_credential).toBe(true);
    expect(clientRows[0]._isOwn).toBe(true);
    expect(
      (clientRows[0].settings as Record<string, unknown>)?.google_email,
    ).toBe("ads@arba.co.il");
    assertNoSecrets(clientRows, integrationType);
  });
}

test("facebook integrations still expose api_key for legacy frontend flows", () => {
  const select = getClientIntegrationSelect("facebook_lead_ads");
  expect(select.includes("api_key")).toBeTruthy();

  const client = toClientIntegration({
    id: "fb-1",
    tenant_id: "tenant-1",
    integration_type: "facebook_lead_ads",
    is_active: true,
    api_key: "EAAB-legacy-page-token",
    settings: { page_name: "Demo Page" },
  });

  expect((client as { api_key?: string }).api_key).toBe(
    "EAAB-legacy-page-token",
  );
  expect(client.has_credential).toBe(true);
});
