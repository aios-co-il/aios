import type { UserRole } from "@/hooks/useUserRole";
import { getAllModules } from "@/lib/modules";

const ROLE_DEFAULT_MODULES: Partial<Record<UserRole, Array<string>>> = {
  campaigner: [
    "dashboard",
    "clients",
    "tasks",
    "chat",
    "time_tracking",
    "dynamic_tables",
  ],
  sales_person: ["dashboard", "leads", "sales_dashboard", "products", "chat"],
  team_manager: [
    "dashboard",
    "clients",
    "tasks",
    "campaigners",
    "reports",
    "client_onboarding",
    "chat",
    "time_tracking",
    "dynamic_tables",
  ],
  seo: ["dashboard", "clients", "tasks", "time_tracking"],
};

/** The modules pre-selected when a role is picked; an owner gets every module. */
export function roleDefaultModules(role: UserRole): Array<string> {
  if (role === "owner") {
    return getAllModules().map((module) => module.id);
  }
  return [...(ROLE_DEFAULT_MODULES[role] ?? [])];
}
