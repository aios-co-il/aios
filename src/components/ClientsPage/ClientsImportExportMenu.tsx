import { Download, FileSpreadsheet, Upload, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ClientsImportExportMenuProps {
  onExport: () => void;
  onImportCsv: () => void;
  onImportSheet: () => void;
  /** Shown only to owners, super admins and team managers; null hides it. */
  onBulkMetaSync: (() => void) | null;
}

/** The import / export menu beside "add client". */
export function ClientsImportExportMenu({
  onExport,
  onImportCsv,
  onImportSheet,
  onBulkMetaSync,
}: ClientsImportExportMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="h-9 gap-2" title="ייבוא/ייצוא">
          <FileSpreadsheet className="h-4 w-4" />
          <span className="hidden sm:inline">ייבוא / ייצוא</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="bg-background">
        <DropdownMenuItem onClick={onExport}>
          <Download className="ml-2 h-4 w-4" />
          ייצוא לאקסל
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onImportCsv}>
          <Upload className="ml-2 h-4 w-4" />
          ייבוא מ-CSV
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onImportSheet}>
          <FileSpreadsheet className="ml-2 h-4 w-4" />
          ייבוא מגוגל שיטס
        </DropdownMenuItem>
        {onBulkMetaSync && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onBulkMetaSync}>
              <Wand2 className="ml-2 h-4 w-4" />
              שייך עמודי Meta לכל הלקוחות
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
