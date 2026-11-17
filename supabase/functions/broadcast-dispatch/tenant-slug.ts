// The tenant slug every unsubscribe link of a broadcast names
// (/unsubscribe/:tenantSlug); looked up once per broadcast.

/** The broadcast tenant's slug, for the unsubscribe page link. */
export async function tenantSlugOf(
  db: TenantSlugDb,
  tenantId: string,
): Promise<string> {
  const { data, error } = await db
    .from("tenants")
    .select("slug")
    .eq("id", tenantId)
    .maybeSingle();
  if (error) {
    throw error;
  }
  const slug: unknown = data?.slug;
  if (typeof slug !== "string" || !slug) {
    throw new Error(`tenant ${tenantId} has no slug`);
  }
  return slug;
}

/** What tenantSlugOf needs from the (untyped) service client. */
type TenantSlugDb = {
  from(table: "tenants"): {
    select(columns: "slug"): {
      eq(
        column: "id",
        value: string,
      ): {
        maybeSingle(): PromiseLike<{
          data: { slug?: unknown } | null;
          error: unknown;
        }>;
      };
    };
  };
};
