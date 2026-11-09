import type { CreateSocialPostArgs } from "./social-publishing-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";

/** Preserves the existing create_social_post executor and side-effect order. */
export async function executeCreateSocialPost(
  args: CreateSocialPostArgs,
  context: ToolExecutionContext,
) {
  const { supabase, tenantId, userId } = context;

  // Insert into both social_media_posts (for publishing) and social_gantt_posts (for planning view)
  const postData = {
    tenant_id: tenantId,
    title: args.title,
    content: args.content,
    post_type: args.post_type || "image",
    media_urls: args.media_urls || [],
    status: "draft",
    created_by: userId !== "system" ? userId : null,
  };
  const { data, error } = await supabase
    .from("social_media_posts")
    .insert(postData)
    .select("id, title, content, post_type, media_urls, status")
    .single();
  if (error) {
    throw error;
  }
  // Also create in gantt for visibility in the content calendar
  const today = new Date().toISOString().split("T")[0];
  try {
    await supabase.from("social_gantt_posts").insert({
      tenant_id: tenantId,
      topic: args.title,
      copy_text: args.content,
      platform: "facebook",
      status: "draft",
      scheduled_date: today,
      creative_url: args.media_urls?.[0] || null,
    });
  } catch {
    /* non-critical */
  }
  return {
    success: true,
    post_id: data.id,
    title: data.title,
    content: data.content,
    media_urls: data.media_urls,
    status: "draft",
    message: "הפוסט נוצר בהצלחה כטיוטה במודול סושיאל מדיה",
  };
}
