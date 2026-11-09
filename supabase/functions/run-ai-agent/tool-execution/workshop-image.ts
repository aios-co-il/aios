import type { ToolExecutionContext } from "../tool-context.ts";
import type { ToolExecutor } from "./route.ts";
import { executeWorkshopTool } from "../../_shared/workshop-tools.ts";

import { remoteAdImage } from "../../_shared/creative/ad-image-remote.ts";

type WorkshopOptions = NonNullable<Parameters<typeof executeWorkshopTool>[6]>;
type ImageArguments = Parameters<NonNullable<WorkshopOptions["generateImage"]>>;

/** Preserves remote-first image generation and the same recursive local fallback. */
export async function executeWorkshopImage(
  context: ToolExecutionContext,
  executeTool: ToolExecutor,
  ...imageArgs: ImageArguments
) {
  const [prompt, format, references, engine] = imageArgs;
  const {
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    tenantId,
    supabase,
    userId,
    callerCampaignerId,
    agentId,
    callerRole,
    callerManagedAgencyIds,
    callerPhone,
    waNotify,
    surface,
    conversationId,
  } = context;

  // Each picture in its own request: several made here ran past the CPU limit.
  const remote = await remoteAdImage(
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    tenantId,
    {
      prompt,
      aspect_ratio: format,
      reference_urls: references,
      engine,
    },
  );
  if (!("missing" in remote && remote.missing)) {
    return remote;
  }
  const made = await executeTool(
    "generate_ad_image",
    {
      prompt,
      aspect_ratio: format,
      reference_urls: references,
      engine,
    },
    supabase,
    tenantId,
    userId,
    callerCampaignerId,
    agentId,
    callerRole,
    callerManagedAgencyIds,
    callerPhone,
    waNotify,
    surface,
    conversationId,
  );
  const metadata = made as
    { image_url?: unknown; error?: unknown } | null | undefined;
  return metadata?.image_url
    ? { image_url: metadata.image_url as string }
    : { error: String(metadata?.error ?? "לא התקבלה תמונה") };
}
