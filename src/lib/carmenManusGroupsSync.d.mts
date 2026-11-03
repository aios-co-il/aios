export type SyncedGroupEntry = {
  groupChatId: string;
  groupId: string;
  name: string;
};

type MergeableGroupRow = {
  id: string;
  group_name: string;
  group_chat_id: string;
  is_blocked: boolean | null;
};

/** Build authoritative group catalog from tenant_integrations sync metadata. */
export function collectSyncedCatalog(integrations: unknown): {
  entries: SyncedGroupEntry[];
  chatIds: string[];
  hasSync: boolean;
};

/** Merge gateway sync catalog with whatsapp_groups rows (DB wins on names). */
export function mergeSyncCatalogWithDb(
  entries: SyncedGroupEntry[],
  dbByChatId: Map<string, MergeableGroupRow>,
): MergeableGroupRow[];
