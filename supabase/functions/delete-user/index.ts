// Deletes a member from an organization while keeping their history
// (AIO-321). Body: { userId | email, tenantId }. The caller is the
// organization's owner or a super admin acting in it; see delete-member.ts.
import { serviceClient } from "../_shared/supabase-clients.ts";
import { memberAdminHandler } from "../_shared/user-admin/member-admin-http.ts";
import { memberAdminStore } from "../_shared/user-admin/member-admin-store.ts";
import { deleteMember } from "./delete-member.ts";

Deno.serve(
  memberAdminHandler(
    "delete-user",
    () => memberAdminStore(serviceClient()),
    deleteMember,
  ),
);
