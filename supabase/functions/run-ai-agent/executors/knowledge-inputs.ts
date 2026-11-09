export type KbListFolderArgs = {
  category?: "clients" | "team" | "messages" | "conversations" | "system_map";
  subcategory?: string;
  path_prefix?: string;
  limit?: number;
};

export type KbSearchArgs = {
  query: string;
  category?: string;
  since_days?: number;
  limit?: number;
};

export type KbOpenArgs = { pointer_id: string };

export type KbRecallConversationArgs = {
  query?: string;
  topic?: string;
  since_days?: number;
  limit?: number;
};

export type KbLearnArgs = {
  topic: string;
  summary: string;
  topic_tags?: Array<string>;
  importance?: number;
  source_table?: string;
  source_ids?: Array<string>;
};
