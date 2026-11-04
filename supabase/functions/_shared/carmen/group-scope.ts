/** The WhatsApp channel a message reached Carmen on (CarmenContext.sourceChannel). */
export type CarmenSourceChannel = "own_instance" | "operator_mirror";

export type GroupScopeGate =
  | { allowed: false; reason: "group_requires_explicit_scope" }
  | { allowed: true; openGroupStart: boolean };

/**
 * Whether a WhatsApp group was opted in to Carmen at all.
 *
 * A legacy "all"-scope automation must not answer inside groups: a group is
 * opted in by a `specific_group` scope (the automation's group list or the
 * access policy's `allowed_group_ids`; whether this group is on that list is
 * checked later as `scope_group`), or by open-member-groups mode, where Carmen
 * answers in any group her own number was added to. Open-member-groups counts
 * only on her own instance: the operator's mirrored Green API line sees all of
 * the operator's personal groups.
 *
 * The handler runs this before the identity check, so a group that was never
 * opted in stays silent instead of telling a participant «אני לא מזהה אותך».
 * `openGroupStart` marks sessions opened only through open-member-groups mode,
 * which stay direct-address-only for their whole lifetime.
 */
export function groupScopeGate(
  scope: { scopeMode: string; openMemberGroups: boolean },
  automationConfig: { carmen_open_member_groups?: unknown },
  sourceChannel: CarmenSourceChannel | null | undefined,
): GroupScopeGate {
  const openMemberGroups =
    (scope.openMemberGroups ||
      automationConfig.carmen_open_member_groups === true) &&
    sourceChannel === "own_instance";
  if (scope.scopeMode === "specific_group") {
    return { allowed: true, openGroupStart: false };
  }
  if (!openMemberGroups) {
    return { allowed: false, reason: "group_requires_explicit_scope" };
  }
  return { allowed: true, openGroupStart: true };
}
