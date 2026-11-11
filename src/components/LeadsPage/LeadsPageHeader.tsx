import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Archive, Download, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AddLeadForm } from "@/components/forms/AddLeadForm";
import { ImportLeadsWithMapping } from "@/components/forms/ImportLeadsWithMapping";
import { cn } from "@/lib/utils";

interface LeadsPageHeaderProps {
  /** The count line under the title, e.g. "מציג 50 מתוך 1,240". */
  subtitle: ReactNode;
  viewToggle: ReactNode;
  onSyncFacebook: () => void;
  isSyncingFacebook: boolean;
}

/** The leads screen title row: name and count, view switch and lead intake. */
export function LeadsPageHeader({
  subtitle,
  viewToggle,
  onSyncFacebook,
  isSyncingFacebook,
}: LeadsPageHeaderProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-accent-100 text-brand-accent-800 dark:bg-brand-accent-900 dark:text-brand-accent-100">
          <Users className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h1 className="text-xl font-bold leading-tight">לידים</h1>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {viewToggle}
        <span className="mx-1 hidden h-6 w-px bg-border lg:block" />
        <Button
          variant="ghost"
          size="sm"
          asChild
          className="h-9 rounded-xl text-muted-foreground"
        >
          <Link to="archive" className="gap-2">
            <Archive className="h-4 w-4" />
            ארכיון
          </Link>
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onSyncFacebook}
          disabled={isSyncingFacebook}
          className="h-9 gap-2 rounded-xl"
        >
          <Download
            className={cn("h-4 w-4", isSyncingFacebook && "animate-spin")}
          />
          {isSyncingFacebook ? "מסנכרן..." : "סנכרן מפייסבוק"}
        </Button>
        <ImportLeadsWithMapping />
        <AddLeadForm />
      </div>
    </div>
  );
}
