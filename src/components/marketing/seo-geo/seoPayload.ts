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
    throw new SeoPayloadValidationError();
  }
  return result.data;
}

/** An expected storage-validation failure that callers may isolate per project. */
export class SeoPayloadValidationError extends Error {
  constructor() {
    super("נתוני תוכנית SEO אינם תקינים");
    this.name = "SeoPayloadValidationError";
  }
}

export type ContentPlanItem = z.infer<typeof contentPlanItemSchema>;

export type SeoPlan = z.infer<typeof seoPlanSchema>;

export type SeoPayload = z.infer<typeof seoPayloadSchema>;

/** The SEO producer emits null for unavailable data; consumers use missing values. */
function optionalDatum<Schema extends z.ZodType>(schema: Schema) {
  return z.preprocess(
    (value) => (value === null ? undefined : value),
    schema.optional(),
  );
}

const text = optionalDatum(z.string());

const texts = optionalDatum(z.array(z.string()));

const priority = optionalDatum(z.enum(["high", "medium", "low"]));

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
  strategy: optionalDatum(strategySchema),
  clusters: optionalDatum(z.array(clusterSchema)),
  contentPlan: optionalDatum(z.array(contentPlanItemSchema)),
  geo: optionalDatum(geoSchema),
  technicalPriorities: optionalDatum(z.array(technicalPrioritySchema)),
  dataNotes: texts,
});

const seoPayloadSchema = z.object({
  department: text,
  brief_text: text,
  brief: text,
  copy_text: text,
  seo_plan: seoPlanSchema.nullish(),
  seo_research: optionalDatum(researchSchema),
  seo_plan_status: z.enum(["pending", "approved"]).optional(),
  seo_plan_feedback: text,
  seo_horizon_months: z.number().optional(),
});

// The application sees the closed contracts above; passthrough data stays opaque to it.
const storedPlanSchema = seoPlanSchema
  .extend({
    strategy: optionalDatum(strategySchema.passthrough()),
    clusters: optionalDatum(z.array(clusterSchema.passthrough())),
    contentPlan: optionalDatum(z.array(contentPlanItemSchema.passthrough())),
    geo: optionalDatum(geoSchema.passthrough()),
    technicalPriorities: optionalDatum(
      z.array(technicalPrioritySchema.passthrough()),
    ),
  })
  .passthrough();

const storedPayloadSchema = seoPayloadSchema
  .extend({
    seo_plan: storedPlanSchema.nullish(),
    seo_research: optionalDatum(researchSchema.passthrough()),
  })
  .passthrough();
