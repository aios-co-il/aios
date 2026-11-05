import { z } from "zod";
import type { CopyConcept } from "./copyConcepts";
import type { StoredCopyVariation } from "./departments/creative/copyVariations";

type StoredConcept = { [Key in keyof CopyConcept]?: CopyConcept[Key] | null };
type StoredVariation = {
  [Key in keyof StoredCopyVariation]?: StoredCopyVariation[Key] | null;
};

const copyConceptSchema: z.ZodType<StoredConcept> = z
  .object({
    id: z.string().nullable(),
    name: z.string().nullable(),
    bigIdea: z.string().nullable(),
    visualLanguage: z.string().nullable(),
    hook: z.string().nullable(),
    copyAngle: z.string().nullable(),
    whyItWorks: z.string().nullable(),
    reference: z.string().nullable(),
    copyId: z.string().nullable(),
    copyKey: z.string().nullable(),
    approved: z.boolean().nullable(),
    approvedAt: z.string().nullable(),
  } satisfies { [Key in keyof CopyConcept]-?: z.ZodType<StoredConcept[Key]> })
  .partial()
  .passthrough();

const copyVariationSchema: z.ZodType<StoredVariation> = z
  .object({
    id: z.string().nullable(),
    key: z.string().nullable(),
    label: z.string().nullable(),
    angle: z.string().nullable(),
    text: z.string().nullable(),
    headline: z.string().nullable(),
    cta: z.string().nullable(),
    conceptId: z.string().nullable(),
    conceptName: z.string().nullable(),
    approved: z.boolean().nullable(),
    approvedAt: z.string().nullable(),
  } satisfies {
    [Key in keyof StoredCopyVariation]-?: z.ZodType<StoredVariation[Key]>;
  })
  .partial()
  .passthrough();

const briefFileSchema = z.object({
  name: z.string(),
  path: z.string().nullish(),
  size: z.number().nullish(),
  type: z.string().nullish(),
});
type StoredBriefFile = z.infer<typeof briefFileSchema>;
export type BriefFile = {
  [Key in keyof StoredBriefFile]: Exclude<StoredBriefFile[Key], null>;
};
const briefFileBoundary: z.ZodType<StoredBriefFile> =
  briefFileSchema.passthrough();

const chatTurnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().nullish(),
  at: z.string().nullish(),
});
export type ChatTurn = {
  role: z.infer<typeof chatTurnSchema>["role"];
  content: string;
  at: string;
};
const chatTurnBoundary: z.ZodType<z.infer<typeof chatTurnSchema>> =
  chatTurnSchema.passthrough();

const creativeConceptSchema = z.object({
  name: z.string().nullish(),
  bigIdea: z.string().nullish(),
  visualLanguage: z.string().nullish(),
  whyItWorks: z.string().nullish(),
  hook: z.string().nullish(),
});
const creativeConceptBoundary: z.ZodType<
  z.infer<typeof creativeConceptSchema>
> = creativeConceptSchema.passthrough();

export const copyPayloadSchema = z.object({
  department: z.string().nullish(),
  project_type: z.string().nullish(),
  content_type: z.string().nullish(),
  channel: z.string().nullish(),
  format: z.string().nullish(),
  brief_text: z.string().nullish(),
  copy_text: z.string().nullish(),
  copy_variations: z.array(copyVariationSchema).nullish(),
  copy_concepts: z.array(copyConceptSchema).nullish(),
  approved_concepts: z.array(copyConceptSchema).nullish(),
  creative_concept: creativeConceptBoundary.nullish(),
  concept_brief: z.string().nullish(),
  visual_prompt: z.string().nullish(),
  linked_copy_item_id: z.string().nullish(),
  linked_copy_title: z.string().nullish(),
  handoff_from: z.string().nullish(),
  handoff_at: z.string().nullish(),
  intake_source: z.string().nullish(),
  handoff_to_creative_item_id: z.string().nullish(),
  last_handoff_at: z.string().nullish(),
  instructions: z.string().nullish(),
  notes: z.string().nullish(),
  copy_chat: z.array(chatTurnBoundary).nullish(),
  copy_prompt: z.string().nullish(),
  last_skin_slug: z.string().nullish(),
  copy_conversation_id: z.string().nullish(),
  brief_files: z.array(briefFileBoundary).nullish(),
  client_files: z.array(briefFileBoundary).nullish(),
  client_website: z.string().nullish(),
  recording_id: z.string().nullish(),
  recording_title: z.string().nullish(),
  recording_excerpt: z.string().nullish(),
});

export type CopyPayload = z.infer<typeof copyPayloadSchema>;
