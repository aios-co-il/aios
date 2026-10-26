import { expect, test } from "vitest";
import {
  permissionForSubpath,
  permissionHandleForPathname,
} from "./moduleRoutePermissions.ts";

test("leads and lead-integrations keep distinct permissions", () => {
  expect(permissionForSubpath("leads")).toBe("leads");
  expect(permissionForSubpath("leads/archive")).toBe("leads");
  expect(permissionForSubpath("lead-integrations")).toBe("lead_integrations");
  expect(
    permissionHandleForPathname("/t/acme/lead-integrations")?.permission,
  ).toBe("lead_integrations");
});

test("the workshop route needs the same permission as its menu item", () => {
  assert.equal(permissionForSubpath("workshop"), "social_media");
  assert.equal(
    permissionHandleForPathname("/t/acme/workshop")?.permission,
    "social_media",
  );
});

test("chat-integrations is not treated as chat/:id", () => {
  expect(permissionForSubpath("chat-integrations")).toBe("chat_integrations");
  expect(permissionForSubpath("chat/abc-123")).toBe("chat");
});

test("tenant index uses dashboard permission; ungated pages stay open", () => {
  expect(permissionHandleForPathname("/t/acme")?.permission).toBe("dashboard");
  expect(permissionHandleForPathname("/t/acme/")?.permission).toBe("dashboard");
  expect(permissionHandleForPathname("/t/acme/home")).toBe(undefined);
  expect(permissionHandleForPathname("/t/acme/my-profile")).toBe(undefined);
  expect(permissionHandleForPathname("/auth")).toBe(undefined);
});

test("org dashboard module stays gated; client dashboard entity route does not", () => {
  expect(permissionForSubpath("dashboard")).toBe("dashboard");
  expect(permissionHandleForPathname("/t/acme/dashboard")?.permission).toBe(
    "dashboard",
  );
  expect(permissionForSubpath("dashboard/abc-123")).toBe(undefined);
  expect(
    permissionHandleForPathname("/t/marketingcaptain/dashboard/abc-123")
      ?.permission,
  ).toBe(undefined);
});

test("recordings route maps to recordings permission", () => {
  expect(permissionForSubpath("recordings")).toBe("recordings");
  expect(permissionHandleForPathname("/t/acme/recordings")?.permission).toBe(
    "recordings",
  );
});

test("integrations hub uses integrations permission, distinct from lead-integrations", () => {
  expect(permissionForSubpath("integrations")).toBe("integrations");
  expect(permissionHandleForPathname("/t/acme/integrations")?.permission).toBe(
    "integrations",
  );
  expect(permissionForSubpath("integrations")).not.toBe("lead_integrations");
});

test("SEO integration settings use integrations permission", () => {
  expect(permissionForSubpath("google-search-console-settings")).toBe(
    "integrations",
  );
  expect(permissionForSubpath("ahrefs-settings")).toBe("integrations");
  expect(permissionForSubpath("integrations/serpapi")).toBe("integrations");
});

test("lead-specific integration settings stay on lead_integrations", () => {
  expect(permissionForSubpath("facebook-settings")).toBe("lead_integrations");
  expect(permissionForSubpath("integrations/facebook")).toBe(
    "lead_integrations",
  );
});
