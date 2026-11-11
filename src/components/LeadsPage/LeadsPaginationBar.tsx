import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Previous / next page of the leads table, with a jump to the last page. */
export function LeadsPaginationBar({
  page,
  totalPages,
  isFetching,
  onPageChange,
  totalLeadsCount,
}: {
  page: number;
  totalPages: number;
  isFetching: boolean;
  onPageChange: (nextPage: number) => void;
  totalLeadsCount?: number;
}) {
  if (totalPages <= 1) {
    return null;
  }
  return (
    <div className="flex flex-wrap items-center justify-center gap-1">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => onPageChange(Math.max(1, page - 1))}
        disabled={page === 1 || isFetching}
        className="h-7 w-7 rounded-full"
        title="הקודם"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
      <span className="whitespace-nowrap px-1 text-xs tabular-nums text-muted-foreground">
        עמוד {page} מתוך {totalPages}
        {isFetching ? (
          <span className="mr-1 animate-pulse">טוען...</span>
        ) : null}
      </span>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => onPageChange(Math.min(totalPages, page + 1))}
        disabled={page === totalPages || isFetching}
        className="h-7 w-7 rounded-full"
        title="הבא"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      {page < totalPages && !isFetching && totalLeadsCount != null && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onPageChange(totalPages)}
          className="h-7 rounded-full px-2 text-xs text-muted-foreground"
        >
          עמוד אחרון ({totalLeadsCount})
        </Button>
      )}
    </div>
  );
}
