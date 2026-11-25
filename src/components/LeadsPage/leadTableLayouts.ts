import { Calendar as CalendarIcon, Users } from "lucide-react";

import type { LeadTableLayout } from "@/lib/leadTableLayout";

/** The table layouts, shared by the mobile toggle and the side panel. */
export const LEAD_TABLE_LAYOUTS: ReadonlyArray<{
  value: LeadTableLayout;
  label: string;
  title: string;
  icon: typeof Users;
}> = [
  {
    value: "by_user",
    label: "לפי משתמשים",
    title: "לפי משתמשים במשטח",
    icon: Users,
  },
  {
    value: "by_date",
    label: "לפי תאריך",
    title: "טבלה אחת לפי תאריך",
    icon: CalendarIcon,
  },
];
