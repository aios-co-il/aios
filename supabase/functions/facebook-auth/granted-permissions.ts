import { z } from "npm:zod@3.25.76";

/** Without these the connection cannot list pages or receive their leads. */
const FACEBOOK_REQUIRED_PERMISSIONS: ReadonlyArray<string> = [
  "pages_show_list",
  "pages_manage_metadata",
];

const permissionsResponseSchema = z.object({
  data: z.array(z.object({ permission: z.string(), status: z.string() })),
});

/**
 * Required permissions missing from a `GET /me/permissions` response. Users can
 * untick permissions in the Login dialog and still finish connecting.
 */
export function missingFacebookPermissions(response: unknown): Array<string> {
  const granted = new Set(
    permissionsResponseSchema
      .parse(response)
      .data.filter(({ status }) => status === "granted")
      .map(({ permission }) => permission),
  );

  return FACEBOOK_REQUIRED_PERMISSIONS.filter(
    (permission) => !granted.has(permission),
  );
}
