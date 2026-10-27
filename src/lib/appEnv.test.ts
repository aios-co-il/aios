import { afterEach, expect, test, vi } from "vitest";
import { buildSharedDashboardUrl, resolveAppEnv } from "./appEnv.ts";

test("unset APP_ENV is production so existing deploys stay open", () => {
  expect(resolveAppEnv(undefined)).toBe("production");
  expect(resolveAppEnv("")).toBe("production");
  expect(resolveAppEnv("staging")).toBe("staging");
  expect(resolveAppEnv("PREVIEW")).toBe("preview");
});

afterEach(() => vi.unstubAllGlobals());

test("buildSharedDashboardUrl uses canonical production origin when window is unavailable", () => {
  vi.stubGlobal("window", undefined);
  expect(buildSharedDashboardUrl("abyaly-6pk5")).toBe(
    "https://aios.co.il/shared/dashboard/abyaly-6pk5",
  );
});
