import type { UserRole } from "@/hooks/useUserRole";

/** Badge colour per role, shared by the users list and the roles legend. */
export const roleBadgeColors: Record<UserRole, string> = {
  owner: "bg-primary",
  team_manager: "bg-secondary",
  campaigner: "bg-accent",
  sales_person: "bg-muted",
  super_admin: "bg-destructive",
  seo: "bg-muted",
};
