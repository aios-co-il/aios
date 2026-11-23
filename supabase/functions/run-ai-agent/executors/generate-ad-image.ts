import type { ToolExecutionContext } from "../tool-context.ts";
import { makeAdImage } from "../../_shared/creative/ad-image.ts";

type GenerateAdImageArgs = {
  prompt: string;
  aspect_ratio?: "1:1" | "16:9" | "9:16" | "4:5";
  reference_urls?: Array<string>;
  engine?: "google" | "elevenlabs" | "higgsfield" | "openai";
};

/** Preserves the existing generate_ad_image executor and side-effect order. */
export async function executeGenerateAdImage(
  args: GenerateAdImageArgs,
  context: ToolExecutionContext,
) {
  const { supabase, tenantId } = context;

  // _shared/creative/ad-image.ts; the workshop runs it in workshop-image (CPU limit).
  return await makeAdImage(supabase, tenantId, args);
}
