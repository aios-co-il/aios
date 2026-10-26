import { expect, test } from "vitest";
import {
  getClientIntegrationSelect,
  integrationHasCredential,
  isGoogleIntegrationConnected,
  sanitizeIntegrationSettings,
  toClientIntegration,
} from "./tenantIntegrationsClient.ts";

test("getClientIntegrationSelect omits api_key for Google types", () => {
  expect(
    !getClientIntegrationSelect("google_ads").includes("api_key"),
  ).toBeTruthy();
  expect(
    getClientIntegrationSelect("facebook_lead_ads").includes("api_key"),
  ).toBeTruthy();
});

test("sanitizeIntegrationSettings strips OAuth secrets for Google", () => {
  const sanitized = sanitizeIntegrationSettings(
    {
      google_email: "ads@example.com",
      refresh_token: "secret-refresh",
      access_token: "secret-access",
      connected_at: "2026-01-01T00:00:00Z",
    },
    "google_ads",
  );

  expect(sanitized?.google_email).toBe("ads@example.com");
  expect(sanitized?.refresh_token).toBe(undefined);
  expect(sanitized?.access_token).toBe(undefined);
});

test("sanitizeIntegrationSettings leaves non-Google settings intact", () => {
  const settings = { page_name: "My Page", api_token: "make-token" };
  expect(sanitizeIntegrationSettings(settings, "make_api")).toStrictEqual(
    settings,
  );
});

test("toClientIntegration removes api_key for Google and keeps has_credential", () => {
  const client = toClientIntegration({
    id: "int-1",
    tenant_id: "tenant-1",
    integration_type: "google_analytics",
    is_active: true,
    api_key: "ya29.secret-access-token",
    settings: {
      refresh_token: "1//secret-refresh",
      google_email: "ga@example.com",
    },
  });

  expect(client.has_credential).toBe(true);
  expect(client.api_key).toBe(undefined);
  expect((client.settings as Record<string, unknown>)?.refresh_token).toBe(
    undefined,
  );
  expect((client.settings as Record<string, unknown>)?.google_email).toBe(
    "ga@example.com",
  );
});

test("toClientIntegration keeps api_key for Facebook integrations", () => {
  const client = toClientIntegration({
    id: "fb-1",
    tenant_id: "tenant-1",
    integration_type: "facebook_lead_ads",
    is_active: true,
    api_key: "EAAB-page-token",
    settings: { page_name: "Demo Page" },
  });

  expect(client.has_credential).toBe(true);
  expect((client as { api_key?: string }).api_key).toBe("EAAB-page-token");
});

test("integrationHasCredential is false when Google row has no tokens or email", () => {
  expect(
    integrationHasCredential({
      id: "x",
      tenant_id: "t",
      integration_type: "google_ads",
      is_active: true,
      settings: {},
    }),
  ).toBe(false);
});

test("isGoogleIntegrationConnected requires active + credential", () => {
  expect(
    isGoogleIntegrationConnected({ is_active: true, has_credential: true }),
  ).toBe(true);
  expect(
    isGoogleIntegrationConnected({ is_active: true, has_credential: false }),
  ).toBe(false);
  expect(
    isGoogleIntegrationConnected({ is_active: false, has_credential: true }),
  ).toBe(false);
});
