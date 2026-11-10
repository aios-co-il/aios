import { bindToolRoute, type ToolRoute } from "../route.ts";
import { executeListSocialPages } from "../../executors/list-social-pages.ts";
import { executeSyncSocialPages } from "../../executors/sync-social-pages.ts";
import { executePublishSocialPost } from "../../executors/publish-social-post.ts";
import { executeFetchSocialComments } from "../../executors/fetch-social-comments.ts";
import { executeListSocialComments } from "../../executors/list-social-comments.ts";
import { executeHideSocialComment } from "../../executors/hide-social-comment.ts";
import { executeCreateSocialPost } from "../../executors/create-social-post.ts";

/** social-publishing tool routes; argument assertions retain the legacy tool boundary. */
export const socialPublishingRoutes: Record<string, ToolRoute> = {
  list_social_pages: bindToolRoute(executeListSocialPages),
  sync_social_pages: bindToolRoute(executeSyncSocialPages),
  publish_social_post: bindToolRoute(executePublishSocialPost),
  fetch_social_comments: bindToolRoute(executeFetchSocialComments),
  list_social_comments: bindToolRoute(executeListSocialComments),
  reply_to_social_comment: bindToolRoute(executeHideSocialComment),
  hide_social_comment: bindToolRoute(executeHideSocialComment),
  create_social_post: bindToolRoute(executeCreateSocialPost),
};
