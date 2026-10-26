// @vitest-environment node
import { expect, test } from "vitest";
import { buildSharedDashboardUrl, resolveAppEnv } from "./appEnv.ts";

test("unset APP_ENV is production so existing deploys stay open", () => {
  expect(resolveAppEnv(undefined)).toBe("production");
  expect(resolveAppEnv("")).toBe("production");
  expect(resolveAppEnv("staging")).toBe("staging");
  expect(resolveAppEnv("PREVIEW")).toBe("preview");
});

test("buildSharedDashboardUrl uses canonical production origin when window is unavailable", () => {
  expect(buildSharedDashboardUrl("abyaly-6pk5")).toBe(
    "https://aios.co.il/shared/dashboard/abyaly-6pk5",
  );
});
