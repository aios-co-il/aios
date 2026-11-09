import type { GenerateAdImageArgs } from "./marketing-work-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";
import { makeAdImage } from "../../_shared/creative/ad-image.ts";

/** Preserves the existing generate_ad_image executor and side-effect order. */
export async function executeGenerateAdImage(
  args: GenerateAdImageArgs,
  context: ToolExecutionContext,
) {
  const { supabase, tenantId } = context;

  // _shared/creative/ad-image.ts; the workshop runs it in workshop-image (CPU limit).
  return await makeAdImage(supabase, tenantId, args);
}
