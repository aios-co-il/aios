import { expect, test } from "vitest";
import {
  collectSyncedCatalog,
  mergeSyncCatalogWithDb,
} from "./carmenManusGroupsSync.mjs";

test("collectSyncedCatalog: prefers groups catalog over bare chat ids", () => {
  const { entries, chatIds, hasSync } = collectSyncedCatalog([
    {
      settings: {
        manus_groups_sync: {
          synced_at: "2026-09-15T12:00:00Z",
          group_chat_ids: ["1@g.us", "2@g.us"],
          groups: [
            {
              groupChatId: "1@g.us",
              groupId: "11111111-1111-4111-8111-111111111111",
              name: "Alpha",
            },
            {
              groupChatId: "2@g.us",
              groupId: "22222222-2222-4222-8222-222222222222",
              name: "Beta",
            },
          ],
        },
      },
    },
  ]);
  expect(hasSync).toBe(true);
  expect(entries.length).toBe(2);
  expect(chatIds.length).toBe(2);
  expect(entries[0].name).toBe("Alpha");
});

test("mergeSyncCatalogWithDb: includes catalog entries missing from DB", () => {
  const merged = mergeSyncCatalogWithDb(
    [
      {
        groupChatId: "9@g.us",
        groupId: "550e8400-e29b-41d4-a716-446655440000",
        name: "Missing in DB",
      },
    ],
    new Map(),
  );
  expect(merged.length).toBe(1);
  expect(merged[0].id).toBe("550e8400-e29b-41d4-a716-446655440000");
  expect(merged[0].group_name).toBe("Missing in DB");
});

test("mergeSyncCatalogWithDb: DB row wins for name when present", () => {
  const merged = mergeSyncCatalogWithDb(
    [
      {
        groupChatId: "1@g.us",
        groupId: "11111111-1111-4111-8111-111111111111",
        name: "Old name",
      },
    ],
    new Map([
      [
        "1@g.us",
        {
          id: "11111111-1111-4111-8111-111111111111",
          group_chat_id: "1@g.us",
          group_name: "Fresh name",
          is_blocked: null,
        },
      ],
    ]),
  );
  expect(merged[0].group_name).toBe("Fresh name");
});
