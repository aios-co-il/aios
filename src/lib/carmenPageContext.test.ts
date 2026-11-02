import { expect, test } from "vitest";
import {
  collectCarmenUiContext,
  formatUiContextForPrompt,
  moduleLabel,
} from "./carmenPageContext.ts";

test("collectCarmenUiContext extracts route params and module", () => {
  const ctx = collectCarmenUiContext({
    pathname: "/t/marketingcaptain/clients/abc-123",
    search: "?tab=overview",
    params: { tenantSlug: "marketingcaptain", clientId: "abc-123" },
    commandCenterView: "dashboard",
  });
  expect(ctx.module).toBe("clients");
  expect(ctx.route_params.clientId).toBe("abc-123");
  expect(ctx.command_center_view).toBe("dashboard");
});

test("formatUiContextForPrompt includes path and ids", () => {
  const text = formatUiContextForPrompt(
    collectCarmenUiContext({
      pathname: "/t/foo/tasks/task-1",
      params: { tenantSlug: "foo", taskId: "task-1" },
    }),
  );
  expect(text).toMatch(/tasks\/task-1/);
  expect(text).toMatch(/taskId=task-1/);
});

test("moduleLabel falls back to raw slug", () => {
  expect(moduleLabel("clients")).toBe("לקוחות");
  expect(moduleLabel("custom-page")).toBe("custom-page");
});
