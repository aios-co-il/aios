export type SaveMemoryArgs = {
  key: string;
  content: string;
  category?:
    | "preferences"
    | "projects"
    | "clients"
    | "workflows"
    | "personal"
    | "instructions";
};

export type RecallMemoryArgs = { category?: string; search?: string };

export type RecallMemoryFtsArgs = {
  query: string;
  limit?: number;
  min_importance?: number;
};

export type DeleteMemoryArgs = { key: string };

export type RecallRecentActionArgs = {
  action_type: string;
  max_age_hours?: number;
};

export type RecordActionEpisodeArgs = {
  action_type: string;
  summary: string;
  topic_tags?: Array<string>;
  importance?: number;
};
