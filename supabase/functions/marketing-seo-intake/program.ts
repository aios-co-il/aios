/** The slice of the Supabase client these helpers use, so tests can fake it. */
export type ProgramDb = { from: (table: string) => any };

export interface SeoProgram {
  client_id: string | null;
  wordpress_site_id: string | null;
}

export const PROGRAM_OF_ANOTHER_CLIENT =
  "תוכנית ה-SEO של הפרויקט שייכת ללקוח אחר";

/**
 * The project's SEO program, or null when it has none. A failed lookup throws: read as "no
 * program", it would skip the client check and make a second program.
 */
export async function findSeoProgram(
  db: ProgramDb,
  workItemId: string,
): Promise<SeoProgram | null> {
  const { data, error } = await db
    .from("seo_geo_programs")
    .select("client_id, wordpress_site_id")
    .eq("work_item_id", workItemId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as SeoProgram | null) ?? null;
}

/**
 * The project's program after the intake. An existing one stays as it is, client and site: the
 * user picks the site in the SEO studio. A project without one gets one on its client, with the
 * client's site. When another intake made it first, that program is kept if it is on the
 * project's client. Null when the program belongs to another client.
 */
export async function ensureSeoProgram(
  db: ProgramDb,
  item: { id: string; tenant_id: string; client_id: string },
  existing: SeoProgram | null,
  siteId: string | null,
): Promise<SeoProgram | null> {
  const own = (program: SeoProgram) =>
    program.client_id === item.client_id ? program : null;
  if (existing) return own(existing);
  const { error } = await db.from("seo_geo_programs").insert({
    tenant_id: item.tenant_id,
    client_id: item.client_id,
    work_item_id: item.id,
    wordpress_site_id: siteId,
  });
  if (!error) return { client_id: item.client_id, wordpress_site_id: siteId };
  const raced =
    error.code === "23505" ? await findSeoProgram(db, item.id) : null;
  if (raced) return own(raced);
  throw new Error(error.message);
}
