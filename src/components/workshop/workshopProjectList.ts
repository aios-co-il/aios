import {
  DEPARTMENTS,
  type DepartmentId,
  projectDepartment,
} from "../../../supabase/functions/_shared/workshop/departments.ts";

/** One row of public.workshop_list_projects. */
export interface WorkshopListRow {
  id: string;
  title: string | null;
  status: string;
  client_id: string | null;
  client_name: string | null;
  department_hint: string | null;
  has_board: boolean;
  project_type: string | null;
  target_channel: string | null;
  track: string | null;
  stage_type: string | null;
  has_copy: boolean;
  has_creative: boolean;
  has_seo_plan: boolean;
  updated_at: string;
  /** The film's payload.format, which the board draws its scenes at. */
  format: string | null;
  /** The film is cut from the user's materials (payload.workshop_edit). */
  workshop_edit: boolean;
}

export interface DepartmentGroup {
  department: DepartmentId;
  label: string;
  items: WorkshopListRow[];
}

export interface ClientGroup {
  clientId: string | null;
  name: string;
  count: number;
  departments: DepartmentGroup[];
}

export const UNASSIGNED_LABEL = "ללא לקוח";

export const STATUS_LABELS: Record<string, string> = {
  draft: "טיוטה",
  in_progress: "בעבודה",
  waiting_approval: "ממתין לאישור",
  approved: "מאושר",
  published: "פורסם",
  failed: "נכשל",
};

export const statusLabel = (status: string) => STATUS_LABELS[status] ?? status;

/** The rows by department, in the registry's order; empty departments are left out. */
export function groupByDepartment(rows: WorkshopListRow[]): DepartmentGroup[] {
  const byDept = new Map<DepartmentId, WorkshopListRow[]>();
  for (const row of rows) {
    const dept = projectDepartment(row);
    byDept.set(dept, [...(byDept.get(dept) ?? []), row]);
  }
  return DEPARTMENTS.filter((dept) => byDept.has(dept.id)).map((dept) => ({
    department: dept.id,
    label: dept.label,
    items: byDept.get(dept.id) ?? [],
  }));
}

/**
 * The project list as the workshop shows it. With every client in view the rows are grouped by
 * client (most recently active first, unassigned last), then by department; otherwise by
 * department only, as one group.
 */
export function groupProjects(
  rows: WorkshopListRow[],
  byClient: boolean,
): ClientGroup[] {
  if (!byClient)
    return rows.length
      ? [
          {
            clientId: null,
            name: "",
            count: rows.length,
            departments: groupByDepartment(rows),
          },
        ]
      : [];
  const order: (string | null)[] = [];
  const byClientId = new Map<string | null, WorkshopListRow[]>();
  for (const row of rows) {
    const key = row.client_id ?? null;
    if (!byClientId.has(key)) {
      byClientId.set(key, []);
      if (key !== null) order.push(key);
    }
    byClientId.get(key)!.push(row);
  }
  if (byClientId.has(null)) order.push(null);
  return order.map((clientId) => {
    const items = byClientId.get(clientId) ?? [];
    return {
      clientId,
      name:
        clientId === null
          ? UNASSIGNED_LABEL
          : items.find((row) => row.client_name)?.client_name?.trim() || "לקוח",
      count: items.length,
      departments: groupByDepartment(items),
    };
  });
}

/** The project opened when the URL names none: the latest one with a workshop board. */
export const defaultProject = (rows: WorkshopListRow[]) =>
  rows.find((row) => row.has_board) ?? null;
