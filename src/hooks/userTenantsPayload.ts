import { z } from "zod";

const optionalString = z.string().nullish().catch(undefined);

/** A `list-user-tenants` entry; extra fields pass through. */
export const userTenantSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    org_type: z.string().catch(""),
    slug: optionalString,
    parent_tenant_id: optionalString,
    status: optionalString,
  })
  .passthrough();

export type UserTenant = z.infer<typeof userTenantSchema>;

const userTenantsResponseSchema = z.object({ tenants: z.unknown() });

/** The `tenants` field of a `list-user-tenants` response, or undefined when the payload has none. */
export const tenantsOfResponse = (payload: unknown): unknown =>
  userTenantsResponseSchema.safeParse(payload).data?.tenants;

/** The usable tenants of a `tenants` list; entries without a non-empty string id and name are dropped. */
export const parseUserTenants = (tenants: unknown[]): UserTenant[] =>
  tenants.flatMap((tenant) => {
    const parsed = userTenantSchema.safeParse(tenant);
    return parsed.success ? [parsed.data] : [];
  });
