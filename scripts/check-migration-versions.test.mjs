import assert from "node:assert/strict";
import { test } from "node:test";

import { duplicateMigrationVersions } from "./check-migration-versions.mjs";

test("two migrations with one version are reported", () => {
  assert.deepEqual(
    duplicateMigrationVersions([
      "20261023100000_meta_data_deletion_requests.sql",
      "20261023100000_carmen_brain_connections.sql",
      "20261025120000_video_studio_openrouter_engine.sql",
    ]),
    [
      {
        version: "20261023100000",
        names: [
          "20261023100000_carmen_brain_connections.sql",
          "20261023100000_meta_data_deletion_requests.sql",
        ],
      },
    ],
  );
});

test("unique versions and non-SQL files pass", () => {
  assert.deepEqual(
    duplicateMigrationVersions([
      "20261023100000_carmen_brain_connections.sql",
      "20261029120000_meta_data_deletion_requests.sql",
      "README.md",
    ]),
    [],
  );
});
