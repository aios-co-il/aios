import { z } from "zod";
import type { Json } from "@/integrations/supabase/types";

/** Decode stored SEO fields while retaining unrelated JSON solely at this boundary. */
export function readSeoPayload(value: Json): SeoPayload | null {
  if (value === null) {
    return null;
  }
  const result = storedPayloadSchema.safeParse(value);
  if (!result.success) {
    console.error(
      "Invalid SEO project payload",
      result.error.issues.map((issue) => issue.path.join(".")),
    );
    throw new Error("נתוני תוכנית SEO אינם תקינים");
  }
  return result.data;
}

export type ContentPlanItem = z.infer<typeof contentPlanItemSchema>;
export type SeoPlan = z.infer<typeof seoPlanSchema>;
export type SeoPayload = z.infer<typeof seoPayloadSchema>;

const text = z.string().optional();
const texts = z.array(z.string()).optional();
const priority = z.enum(["high", "medium", "low"]).optional();
const strategySchema = z.object({
  objective: text,
  audience: text,
  market: text,
  currentState: text,
  opportunity: text,
});
export const SEO_STRATEGY_FIELDS = strategySchema.keyof().options;

const clusterSchema = z.object({
  name: text,
  intent: text,
  pillarKeyword: text,
  supportingKeywords: texts,
  priority,
  evidence: text,
});
const contentPlanItemSchema = z.object({
  title: text,
  contentType: text,
  primaryKeyword: text,
  cluster: text,
  intent: text,
  angle: text,
  geoQuestions: texts,
  priority,
  status: text,
});
const geoSchema = z.object({
  entities: texts,
  questions: texts,
  citationTargets: texts,
  schemaRecommendations: texts,
});
const technicalPrioritySchema = z.object({
  issue: text,
  impact: text,
  action: text,
  priority,
});
const researchSchema = z.object({
  competitors: texts,
  keyword_seeds: texts,
  ai_visibility_notes: texts,
  data_gaps: texts,
});
const seoPlanSchema = z.object({
  strategy: strategySchema.optional(),
  clusters: z.array(clusterSchema).optional(),
  contentPlan: z.array(contentPlanItemSchema).optional(),
  geo: geoSchema.optional(),
  technicalPriorities: z.array(technicalPrioritySchema).optional(),
  dataNotes: texts,
});
const seoPayloadSchema = z.object({
  department: text,
  brief_text: text,
  brief: text,
  copy_text: text,
  seo_plan: seoPlanSchema.nullish(),
  seo_research: researchSchema.optional(),
  seo_plan_status: z.enum(["pending", "approved"]).optional(),
  seo_plan_feedback: text,
  seo_horizon_months: z.number().optional(),
});

// The application sees the closed contracts above; passthrough data stays opaque to it.
const storedPlanSchema = seoPlanSchema
  .extend({
    strategy: strategySchema.passthrough().optional(),
    clusters: z.array(clusterSchema.passthrough()).optional(),
    contentPlan: z.array(contentPlanItemSchema.passthrough()).optional(),
    geo: geoSchema.passthrough().optional(),
    technicalPriorities: z
      .array(technicalPrioritySchema.passthrough())
      .optional(),
  })
  .passthrough();
const storedPayloadSchema = seoPayloadSchema
  .extend({
    seo_plan: storedPlanSchema.nullish(),
    seo_research: researchSchema.passthrough().optional(),
  })
  .passthrough();
