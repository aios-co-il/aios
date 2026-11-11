import { forwardRef, type ComponentProps, type ReactNode } from "react";
import {
  Columns3,
  FileSpreadsheet,
  Loader2,
  Settings2,
  Tag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ManageLeadStatusesDialog } from "@/components/forms/ManageLeadStatusesDialog";
import { ChatTagsManager } from "@/components/chat/ChatTagsManager";
import { LeadTableColumnsDialog } from "@/components/leads/LeadTableColumnsDialog";
import { LeadsSearchInput } from "./LeadsSearchInput";

interface LeadsToolbarProps {
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  /** Saved filters and stage chips. */
  presets: ReactNode;
  /** Table-only controls such as the layout switch. */
  tableControls?: ReactNode;
  canManageColumns: boolean;
  onExport: () => void;
  isExporting: boolean;
}

/** One calm bar: search, saved filters, and the list's settings tools. */
export function LeadsToolbar({
  searchQuery,
  onSearchQueryChange,
  presets,
  tableControls,
  canManageColumns,
  onExport,
  isExporting,
}: LeadsToolbarProps) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-2xl border bg-card p-2 shadow-elevation-1">
      <LeadsSearchInput
        value={searchQuery}
        onChange={onSearchQueryChange}
        className="w-56 shrink-0 xl:w-72"
      />
      <div className="flex min-w-0 flex-1">{presets}</div>
      {tableControls}
      <span className="mx-0.5 h-6 w-px shrink-0 bg-border" />
      <div className="flex shrink-0 items-center gap-0.5">
        {canManageColumns && (
          <LeadTableColumnsDialog
            trigger={
              <ToolButton title="עמודות טבלה">
                <Columns3 className="h-4 w-4" />
              </ToolButton>
            }
          />
        )}
        <ManageLeadStatusesDialog
          trigger={
            <ToolButton title="ניהול סטטוסי לידים">
              <Settings2 className="h-4 w-4" />
            </ToolButton>
          }
        />
        <ChatTagsManager
          trigger={
            <ToolButton title="ניהול תגיות">
              <Tag className="h-4 w-4" />
            </ToolButton>
          }
        />
        <ToolButton
          onClick={onExport}
          disabled={isExporting}
          title="ייצוא כל הלידים לפי הסינון לקובץ Excel"
        >
          {isExporting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <FileSpreadsheet className="h-4 w-4" />
          )}
        </ToolButton>
      </div>
    </div>
  );
}

/** A quiet icon button; forwards its ref so dialogs can use it as a trigger. */
const ToolButton = forwardRef<HTMLButtonElement, ComponentProps<typeof Button>>(
  function ToolButton(props, ref) {
    return (
      <Button
        ref={ref}
        variant="ghost"
        size="icon"
        className="h-9 w-9 shrink-0 rounded-xl text-muted-foreground hover:text-foreground"
        {...props}
      />
    );
  },
);
