import assert from "node:assert/strict";
import { test } from "node:test";
import { loadTargets } from "../src/targets.mjs";

const key = "service-role";

test("one SUPABASE_URL pair is the only target", () => {
  const targets = loadTargets({
    SUPABASE_URL: "https://staging.supabase.co/",
    SUPABASE_SERVICE_ROLE_KEY: key,
    WORKER_ENV: "staging",
  });
  assert.deepEqual(targets, [
    { name: "staging", url: "https://staging.supabase.co", serviceRoleKey: key },
  ]);
});

test("named pairs for several environments are refused", () => {
  assert.throws(
    () =>
      loadTargets({
        SUPABASE_URL: "https://staging.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: key,
        SUPABASE_URL_PRODUCTION: "https://prod.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY_PRODUCTION: "other",
      }),
    /one worker serves one environment/,
  );
});

test("an unknown environment name fails before any poll", () => {
  assert.throws(
    () =>
      loadTargets({
        SUPABASE_URL: "https://staging.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: key,
        WORKER_ENV: "everything",
      }),
    /WORKER_ENV must be one of/,
  );
});

test("a URL without its key fails", () => {
  assert.throws(
    () => loadTargets({ SUPABASE_URL: "https://staging.supabase.co" }),
    /SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required/,
  );
});
