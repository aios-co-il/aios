import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withTestQuery } from "@/test/withTestQuery";
import GoogleAnalyticsSettings from "./GoogleAnalyticsSettings";
import {
  connectionDateCases,
  connectionDateErrorCases,
  primitiveSettingsCases,
} from "./GoogleAnalyticsSettings.test-cases";

const context = vi.hoisted((): { settings: unknown } => ({
  settings: undefined,
}));
const email = "person@example.test";

vi.mock("@/contexts/TenantContext", () => ({
  useTenant: () => ({ currentTenantId: null }),
}));
vi.mock("@/hooks/useCurrentUser", () => ({
  useCurrentUser: () => ({ userId: "user-1" }),
}));
vi.mock("@/hooks/useTenantPath", () => ({
  useTenantPath: () => ({ buildPath: (path: string) => path }),
}));
vi.mock("@/hooks/useUserIntegrations", () => ({
  useUserIntegrations: () => ({
    data: [
      {
        id: "integration-1",
        user_id: "user-1",
        settings: context.settings,
        _isOwn: true,
      },
    ],
    isLoading: false,
  }),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/components/forms/ManageIntegrationPermissionsDialog", () => ({
  ManageIntegrationPermissionsDialog: () => null,
}));

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** Render the actual page while leaving the unrelated tenant query disabled. */
function renderPage() {
  return render(
    withTestQuery(
      <MemoryRouter>
        <GoogleAnalyticsSettings />
      </MemoryRouter>,
    ),
  );
}

describe("GoogleAnalyticsSettings connection date output", () => {
  for (const [name, connectedAt, expected] of connectionDateCases) {
    it(`preserves ${name} connected_at rendering`, () => {
      context.settings = { google_email: email, connected_at: connectedAt };
      renderPage();
      const account = screen.getByText(email).parentElement?.parentElement;
      expect(account?.textContent).toBe(email + expected);
      expect(console.error).not.toHaveBeenCalled();
    });
  }

  for (const [name, settings] of primitiveSettingsCases) {
    it(`preserves a whole ${name} settings value`, () => {
      context.settings = settings;
      renderPage();
      const account =
        screen.getByText("חשבון לא ידוע").parentElement?.parentElement;
      expect(account?.textContent).toBe("חשבון לא ידוע");
      expect(console.error).not.toHaveBeenCalled();
    });
  }

  for (const [name, connectedAt] of connectionDateErrorCases) {
    it(`preserves the existing Date error for ${name}`, () => {
      context.settings = { google_email: email, connected_at: connectedAt };
      expect(renderPage).toThrow(TypeError);
      expect(console.error).toHaveBeenCalled();
    });
  }
});
