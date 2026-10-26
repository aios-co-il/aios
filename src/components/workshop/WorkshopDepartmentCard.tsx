import { format } from "date-fns";
import { he } from "date-fns/locale";
import { ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useTenantPath } from "@/hooks/useTenantPath";
import {
  departmentLabel,
  departmentScreen,
  projectDepartment,
} from "../../../supabase/functions/_shared/workshop/departments.ts";
import {
  departmentPath,
  statusLabel,
  UNASSIGNED_LABEL,
  type WorkshopListRow,
} from "./workshopProjectList";

/** A project that lives in a department screen, not on a workshop board. */
export function WorkshopDepartmentCard({ item }: { item: WorkshopListRow }) {
  const { buildPath } = useTenantPath();
  const dept = projectDepartment(item);
  // The campaigns screen is not open yet; a creative handed off to it is still shown in Creative.
  const screen =
    dept === "campaigns" && item.has_creative
      ? "creative"
      : departmentScreen(dept);
  const updated = new Date(item.updated_at);
  const rows: Array<[string, string]> = [
    ["מחלקה", departmentLabel(dept)],
    ["סטטוס", statusLabel(item.status)],
    ["לקוח", item.client_name?.trim() || UNASSIGNED_LABEL],
    [
      "עדכון אחרון",
      Number.isNaN(updated.getTime())
        ? "—"
        : format(updated, "d בMMMM yyyy, HH:mm", { locale: he }),
    ],
  ];
  return (
    <div className="flex h-full items-start justify-center overflow-y-auto p-4 md:p-8">
      <section className="w-full max-w-lg rounded-xl border bg-card p-5 shadow-sm">
        <p className="text-xs text-muted-foreground">
          פרויקט של מחלקת {departmentLabel(dept)}
        </p>
        <h2 className="mt-1 text-lg font-semibold">
          {item.title?.trim() || "ללא שם"}
        </h2>
        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          {rows.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-muted-foreground">{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-sm text-muted-foreground">
          לפרויקט הזה אין לוח בסדנה. עובדים עליו במסך המחלקה.
        </p>
        <div className="mt-4">
          {screen ? (
            <Button asChild size="sm" className="gap-1.5">
              <Link to={buildPath(departmentPath(screen, item.client_id))}>
                <ExternalLink className="h-4 w-4" />
                פתח במסך המחלקה
              </Link>
            </Button>
          ) : (
            <Button size="sm" disabled>
              מסך המחלקה בקרוב
            </Button>
          )}
        </div>
      </section>
    </div>
  );
}
