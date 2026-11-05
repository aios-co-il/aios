import type { Database } from "@/integrations/supabase/types";

/**
 * Raw named properties of marketing_work_items.payload, before domain readers narrow them.
 * Preserve the existing object-root boundary assumption; this view does not validate a row.
 * Every value retains its generated storage type, including malformed domain values and nulls.
 * Opaque properties stay on the original runtime object and are preserved by existing spreads.
 */
export type StoredCreativePayload = {
  department?: StoredField;
  project_type?: StoredField;
  format?: StoredField;
  brief?: StoredField;
  brief_text?: StoredField;
  copy_text?: StoredField;
  approved_concepts?: StoredField;
  concept_brief?: StoredField;
  visual_prompt?: StoredField;
  linked_copy_item_id?: StoredField;
  linked_copy_title?: StoredField;
  handoff_from?: StoredField;
  intake_source?: StoredField;
  notes?: StoredField;
  instructions?: StoredField;
  variations?: StoredField;
  image_url?: StoredField;
  live_text_layers?: StoredField;
  storyboard?: StoredField;
  storyboard_style?: StoredField;
  video?: StoredField;
};

type StoredField =
  Database["public"]["Tables"]["marketing_work_items"]["Row"]["payload"];
