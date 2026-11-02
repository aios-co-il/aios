import { expect, test } from "vitest";
import { mcpPresetBaseUrl, mcpPresetFunctionUrl } from "./mcpPresetUrl.ts";

test("MCP presets follow staging VITE_SUPABASE_URL", () => {
  const env = {
    VITE_SUPABASE_URL: "https://mzjsuvatrzhciojmbbbm.supabase.co",
  };
  expect(mcpPresetBaseUrl(env)).toBe(
    "https://mzjsuvatrzhciojmbbbm.supabase.co",
  );
  expect(mcpPresetFunctionUrl("cursor-mcp", env)).toBe(
    "https://mzjsuvatrzhciojmbbbm.supabase.co/functions/v1/cursor-mcp",
  );
});

test("MCP presets throw when VITE_SUPABASE_URL is missing", () => {
  expect(() => mcpPresetBaseUrl({})).toThrow(/VITE_SUPABASE_URL is not set/);
  expect(() => mcpPresetFunctionUrl("cursor-mcp", {})).toThrow(
    /VITE_SUPABASE_URL is not set/,
  );
});
