import type { UserRole } from "@/hooks/useUserRole";

/** One member row on the Users page, as built by the page's users query. */
export interface ManagedUser {
  id: string;
  email: string;
  full_name: string | null;
  status: string | null;
  campaigner_id: string | null;
  sales_person_id: string | null;
  campaigner_name?: string;
  sales_person_name?: string;
  roles: Array<UserRole>;
}

/** A team card (campaigner or sales person) a user can be linked to. */
export interface TeamOption {
  id: string;
  full_name: string;
}

/** What a row can ask the page to do; the page owns mutations and dialogs. */
export interface UserRowActions {
  addRole: (user: ManagedUser, role: UserRole) => void;
  removeRole: (user: ManagedUser, role: UserRole) => void;
  setCampaigner: (user: ManagedUser, campaignerId: string | null) => void;
  setSalesPerson: (user: ManagedUser, salesPersonId: string | null) => void;
  editName: (user: ManagedUser) => void;
  editAgencies: (user: ManagedUser) => void;
  editSalesPersonAgencies: (user: ManagedUser) => void;
  editPermissions: (user: ManagedUser) => void;
  resetPassword: (user: ManagedUser) => void;
  viewAs: (user: ManagedUser) => void;
  resendInvite: (user: ManagedUser) => void;
  deleteUser: (user: ManagedUser) => void;
}

/** Shared inputs for the desktop table and the mobile cards. */
export interface UsersListProps {
  users: Array<ManagedUser>;
  roleLabels: Record<UserRole, string>;
  campaigners: Array<TeamOption>;
  salesPeople: Array<TeamOption>;
  /** Agency names of the user's sales-person card, comma separated. */
  salesPersonAgencyNames: (user: ManagedUser) => string;
  canViewAs: (user: ManagedUser) => boolean;
  currentUserId: string | null | undefined;
  actions: UserRowActions;
  resendPending: boolean;
  deletePending: boolean;
}
