/**
 * The departments a client's projects belong to, in the order the workshop shows them, and the
 * rule that decides a project's department from what workshop_list_projects returns.
 * Plain TypeScript: the workshop page imports it, and so can the server.
 */

export type DepartmentId =
  "creative" | "copy" | "seo" | "social" | "web" | "campaigns";

/** The MarketingDepartment route ids (/t/:slug/marketing/department/:department). */
export type DepartmentScreen = "creative" | "copy" | "seo" | "campaigns";

export interface Department {
  id: DepartmentId;
  label: string;
  screen: DepartmentScreen | null;
}

export const DEPARTMENTS: readonly Department[] = [
  { id: "creative", label: "קריאייטיב", screen: "creative" },
  { id: "copy", label: "קופי", screen: "copy" },
  { id: "seo", label: "SEO / GEO", screen: "seo" },
  { id: "social", label: "סושיאל", screen: null },
  { id: "web", label: "בניית אתרים", screen: null },
  { id: "campaigns", label: "קמפיינים", screen: "campaigns" },
];

const BY_ID = new Map(DEPARTMENTS.map((dept) => [dept.id, dept]));

export const isDepartmentId = (value: unknown): value is DepartmentId =>
  typeof value === "string" && BY_ID.has(value as DepartmentId);

export const departmentLabel = (dept: DepartmentId) =>
  BY_ID.get(dept)?.label ?? dept;

/** The department's own screen in the marketing area, or null when it has none yet. */
export const departmentScreen = (dept: DepartmentId): DepartmentScreen | null =>
  BY_ID.get(dept)?.screen ?? null;

/** The fields of a workshop_list_projects row this rule reads. */
export interface ProjectDepartmentInput {
  department_hint?: string | null;
  has_board?: boolean | null;
  track?: string | null;
  stage_type?: string | null;
  has_copy?: boolean | null;
  has_creative?: boolean | null;
  has_seo_plan?: boolean | null;
}

const TRACK_DEPARTMENT: Record<string, DepartmentId> = {
  seo_geo: "seo",
  social_organic: "social",
};

const STAGE_DEPARTMENT: Record<string, DepartmentId> = {
  copy: "copy",
  creative: "creative",
  target_seo: "seo",
  target_organic: "social",
  target_paid: "campaigns",
};

/**
 * A project's department, strongest signal first: the department it was tagged with, a workshop
 * board, its pipeline track, its current stage, then what its payload holds. Creative otherwise.
 * public.workshop_assign_client mirrors this rule in SQL: change both together.
 */
export function projectDepartment(row: ProjectDepartmentInput): DepartmentId {
  if (isDepartmentId(row.department_hint)) return row.department_hint;
  if (row.has_board) return "creative";
  const byTrack = row.track ? TRACK_DEPARTMENT[row.track] : undefined;
  if (byTrack) return byTrack;
  const byStage = row.stage_type ? STAGE_DEPARTMENT[row.stage_type] : undefined;
  if (byStage) return byStage;
  if (row.has_seo_plan) return "seo";
  if (row.has_copy) return "copy";
  if (row.has_creative) return "creative";
  return "creative";
}

const ASSIGN_FAILED = "לא הצלחנו לשייך את הפרויקט ללקוח";

/**
 * What to tell the user when workshop_assign_client fails. The RPC explains its own refusals in
 * Hebrew; anything else (a network or RLS error) gets a plain sentence, with the raw detail
 * appended when asked for (Carmen can explain it, a toast should not show it).
 */
export function assignClientErrorMessage(
  error: { message?: string | null } | null | undefined,
  withDetail = false,
): string {
  const message = error?.message?.trim() ?? "";
  if (/[א-ת]/.test(message)) return message;
  return withDetail && message ? `${ASSIGN_FAILED}: ${message}` : ASSIGN_FAILED;
}

/** Departments whose projects stay with their client once assigned (workshop_assign_client). */
export const CLIENT_LOCKED_DEPARTMENTS: readonly DepartmentId[] = [
  "seo",
  "social",
];

/** True when the project has a client it cannot leave: moving or releasing it is refused. */
export const isClientLocked = (
  row: ProjectDepartmentInput & { client_id?: string | null },
) =>
  !!row.client_id && CLIENT_LOCKED_DEPARTMENTS.includes(projectDepartment(row));
