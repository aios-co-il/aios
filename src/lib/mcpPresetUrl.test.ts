import assert from "node:assert/strict";
import test from "node:test";
import { mcpPresetBaseUrl, mcpPresetFunctionUrl } from "./mcpPresetUrl.ts";

test("MCP presets follow staging VITE_SUPABASE_URL", () => {
  const env = {
    VITE_SUPABASE_URL: "https://mzjsuvatrzhciojmbbbm.supabase.co",
  };
  assert.equal(
    mcpPresetBaseUrl(env),
    "https://mzjsuvatrzhciojmbbbm.supabase.co",
  );
  assert.equal(
    mcpPresetFunctionUrl("cursor-mcp", env),
    "https://mzjsuvatrzhciojmbbbm.supabase.co/functions/v1/cursor-mcp",
  );
});

test("MCP presets throw when VITE_SUPABASE_URL is missing", () => {
  assert.throws(() => mcpPresetBaseUrl({}), /VITE_SUPABASE_URL is not set/);
  assert.throws(
    () => mcpPresetFunctionUrl("cursor-mcp", {}),
    /VITE_SUPABASE_URL is not set/,
  );
});
