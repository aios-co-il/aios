export type GetCarmenSkinsArgs = unknown;

export type RecallSkillsArgs = { query: string; limit?: number };

export type CreateSkillArgs = {
  name: string;
  description: string;
  body: string;
  trigger_phrases?: Array<string>;
};

export type UpdateSkillArgs = {
  skill_id: string;
  body: string;
  description?: string;
  change_note?: string;
};
