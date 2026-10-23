/**
 * One row of ai_skills as a "skin" (role-persona). Global skins are read-only
 * for non-super-admins; a tenant can clone a global skin to an editable override
 * on the same slug (the registry resolves tenant overrides over global).
 */
export interface Skin {
  id: string;
  slug: string;
  scope: string;
  name: string;
  description: string | null;
  goal: string | null;
  constraints: string | null;
  system_prompt: string | null;
  output_template: string | null;
  steps: string | null;
  allowed_tools: string[] | null;
  triggers: string[] | null;
  handoff_slugs: string[] | null;
  model: string | null;
  is_active: boolean;
  tenant_id: string | null;
  version: number | null;
}

export type SkinDraft = Partial<Skin>;

export const SKIN_FIELDS =
  "id,slug,scope,name,description,goal,constraints,system_prompt,output_template,steps,allowed_tools,triggers,handoff_slugs,model,is_active,tenant_id,version";

export const toList = (v: string): string[] =>
  v
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
