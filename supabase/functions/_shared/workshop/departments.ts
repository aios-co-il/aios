/**
 * The departments a client's projects belong to, in the order the workshop shows them, and the
 * rule that decides a project's department from what workshop_list_projects returns.
 * Plain TypeScript: the workshop page imports it, and so can the server.
 */

export type DepartmentId =
  "creative" | "copy" | "seo" | "social" | "web" | "campaigns";

/**
 * The open MarketingDepartment screens (/t/:slug/marketing/department/:department). The
 * campaigns route exists but is still a coming-soon placeholder, so nothing links to it.
 */
export type DepartmentScreen = "creative" | "copy" | "seo";

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
  { id: "campaigns", label: "קמפיינים", screen: null },
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
 * Untagged creative work (has_creative: variations, a static or video project, a picture) goes
 * to Creative whatever brief, copy or copy stage it carries. isCreativeDepartmentItem lists each
 * of these, a static project before its first picture too, and isCopyDepartmentItem leaves out
 * variations and static or video projects, so the card links to the screen that shows them.
 */
export function projectDepartment(row: ProjectDepartmentInput): DepartmentId {
  if (isDepartmentId(row.department_hint)) return row.department_hint;
  if (row.has_board) return "creative";
  const byTrack = row.track ? TRACK_DEPARTMENT[row.track] : undefined;
  if (byTrack) return byTrack;
  const byStage = row.stage_type ? STAGE_DEPARTMENT[row.stage_type] : undefined;
  if (byStage === "copy" && row.has_creative) return "creative";
  if (byStage) return byStage;
  if (row.has_seo_plan) return "seo";
  if (row.has_copy && !row.has_creative) return "copy";
  return "creative";
}
