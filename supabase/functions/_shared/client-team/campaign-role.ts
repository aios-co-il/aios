/**
 * True when a client_team role_on_account names the campaign (PPC) role.
 * trigger-automation prefers that member as a task's campaigner and the
 * manager round routes to them, so both read the role through this one rule.
 */
export function isCampaignRole(
  roleOnAccount: string | null | undefined,
): boolean {
  return /campaign|ppc|קמפיינ/i.test(roleOnAccount ?? "");
}
