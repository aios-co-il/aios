import { capabilityReport } from "../capabilities.ts";
import { type ToolContext } from "../tool-context.ts";

export async function workshopCheckConnections(ctx: ToolContext) {
  const { supabase, tenantId, deps } = ctx;
  const { data, error } = await supabase
    .from("tenant_integrations")
    .select("settings")
    .eq("tenant_id", tenantId)
    .eq("integration_type", "llm")
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return { error: error.message };
  const report = capabilityReport(
    (data?.settings ?? {}) as Record<string, unknown>,
    { openai: deps.envOpenAiKey },
    deps.videoConnections ? await deps.videoConnections() : {},
  );
  return {
    success: true,
    ...report,
    message:
      report.missing.length === 0
        ? "הכול מחובר: אפשר ליצור תמונות, סרטון, קריינות ומוזיקה."
        : `מה שחסר: ${report.missing.join("; ")}.`,
  };
}
