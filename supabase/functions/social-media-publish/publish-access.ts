import {
  authorizeTenantPublisher,
  type PublishAccessDb,
  type PublishAccessLookups,
  type PublishCaller,
  type PublishDecision,
} from "../_shared/tenant-publish-access.ts";

/** The social_media_posts columns the access check reads. */
export type PostToPublish = {
  tenant_id: string;
  publish_to_wordpress: boolean | null;
  wordpress_site_url: string | null;
};

/** Whether `caller` may publish `post` (AIO-234): a member of the post's
 * tenant who, as in social-publish, can also access the client it publishes
 * for. Posts and channels have no client_id; the WordPress site a post goes to
 * may belong to a client, so that site's client is the one checked. */
export async function authorizePostPublisher(
  db: PublishAccessDb,
  caller: PublishCaller,
  post: PostToPublish,
  lookups: PublishAccessLookups,
): Promise<PublishDecision> {
  const clientIds =
    caller.kind === "user" ? await wordPressSiteClientIds(db, post) : [];
  return authorizeTenantPublisher(caller, post.tenant_id, clientIds, lookups);
}

/** The clients of the active sites matching the post's WordPress URL, found
 * as publishToWordPress finds the site; a site without a client adds none. */
async function wordPressSiteClientIds(
  db: PublishAccessDb,
  post: PostToPublish,
): Promise<Array<string | null>> {
  if (!post.publish_to_wordpress || !post.wordpress_site_url) {
    return [];
  }
  const { data, error } = await db
    .from("social_media_wordpress_sites")
    .select("client_id")
    .eq("tenant_id", post.tenant_id)
    .eq("site_url", post.wordpress_site_url)
    .eq("is_active", true);
  if (error) {
    throw error;
  }
  return (data ?? []).map(
    (site: { client_id: string | null }) => site.client_id,
  );
}
