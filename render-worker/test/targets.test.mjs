import assert from "node:assert/strict";
import { test } from "node:test";
import { loadTargets } from "../src/targets.mjs";

const key = "service-role";

test("a single SUPABASE_URL pair stays one target", () => {
  const targets = loadTargets({
    SUPABASE_URL: "https://prod.supabase.co/",
    SUPABASE_SERVICE_ROLE_KEY: key,
  });
  assert.deepEqual(targets, [
    { name: "default", url: "https://prod.supabase.co", serviceRoleKey: key },
  ]);
});

test("production, staging and develop are three polls, and a repeated origin is once", () => {
  const targets = loadTargets({
    SUPABASE_URL: "https://prod.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: key,
    WORKER_TARGET: "production",
    SUPABASE_URL_PRODUCTION: "https://prod.supabase.co/",
    SUPABASE_SERVICE_ROLE_KEY_PRODUCTION: "other",
    SUPABASE_URL_STAGING: "https://staging.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY_STAGING: "staging-key",
    SUPABASE_URL_DEVELOP: "https://develop.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY_DEVELOP: "develop-key",
  });
  assert.deepEqual(
    targets.map((target) => target.name),
    ["production", "staging", "develop"],
  );
  assert.equal(targets[0].serviceRoleKey, key);
  assert.equal(targets[1].url, "https://staging.supabase.co");
  assert.equal(targets[2].serviceRoleKey, "develop-key");
});

test("a named pair missing its key fails before any poll", () => {
  assert.throws(
    () =>
      loadTargets({
        SUPABASE_URL_STAGING: "https://staging.supabase.co",
      }),
    /SUPABASE_URL_STAGING and SUPABASE_SERVICE_ROLE_KEY_STAGING/,
  );
});
