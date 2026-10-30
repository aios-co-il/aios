import { expect, test } from "vitest";
import {
  checkOutbound,
  isSafeModeEnabled,
  parseAllowlist,
} from "./integrationGuard.ts";

test("production always allows even if safe mode is set", () => {
  const result = checkOutbound({
    appEnv: "production",
    stagingSafeMode: "true",
    integration: "whatsapp",
    destination: "0500000000",
  });
  expect(result.decision).toBe("ALLOW");
  expect(isSafeModeEnabled("production", "true")).toBe(false);
});

test("unset env is treated as production and allows", () => {
  const result = checkOutbound({
    integration: "whatsapp",
    destination: "0500000000",
  });
  expect(result.decision).toBe("ALLOW");
  expect(result.environment).toBe("production");
});

test("staging safe mode blocks destinations not on the allowlist", () => {
  const blocked = checkOutbound({
    appEnv: "staging",
    stagingSafeMode: "true",
    integration: "whatsapp",
    destination: "972501111111",
    allowlistRaw: "972502222222",
  });
  expect(blocked.decision).toBe("BLOCK");

  const allowed = checkOutbound({
    appEnv: "staging",
    stagingSafeMode: "true",
    integration: "whatsapp",
    destination: "0502222222",
    allowlistRaw: "972502222222",
  });
  expect(allowed.decision).toBe("ALLOW");
});

test("empty allowlist blocks all WhatsApp in staging", () => {
  const result = checkOutbound({
    appEnv: "staging",
    integration: "whatsapp",
    destination: "972501111111",
  });
  expect(result.decision).toBe("BLOCK");
  expect(result.reason).toBe("empty_allowlist");
});

test("staging blocks WhatsApp groups", () => {
  const result = checkOutbound({
    appEnv: "staging",
    integration: "whatsapp",
    destination: "group:123@g.us",
  });
  expect(result.decision).toBe("BLOCK");
});

test("parseAllowlist splits commas and spaces", () => {
  expect(parseAllowlist("972501111111, 0502222222")).toStrictEqual([
    "972501111111",
    "0502222222",
  ]);
});
