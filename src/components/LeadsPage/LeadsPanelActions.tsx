import { Link } from "react-router-dom";
import {
  Archive,
  Columns3,
  Download,
  FileSpreadsheet,
  Loader2,
  Settings2,
  Tag,
  Upload,
} from "lucide-react";

import { ChatTagsManager } from "@/components/chat/ChatTagsManager";
import { ImportLeadsWithMapping } from "@/components/forms/ImportLeadsWithMapping";
import { ManageLeadStatusesDialog } from "@/components/forms/ManageLeadStatusesDialog";
import { LeadTableColumnsDialog } from "@/components/leads/LeadTableColumnsDialog";
import { useModuleSidePanel } from "@/components/shared/ModuleSidePanel/moduleSidePanelContext";
import { ModuleSidePanelItem } from "@/components/shared/ModuleSidePanel/ModuleSidePanelItem";
import { PanelTooltip } from "@/components/shared/ModuleSidePanel/PanelTooltip";
import { PanelRowContent } from "@/components/shared/ModuleSidePanel/PanelRow";
import { panelRowClassName } from "@/components/shared/ModuleSidePanel/panelRowClassName";
import { cn } from "@/lib/utils";

export interface LeadsPanelToolsProps {
  canManageColumns: boolean;
  onExport: () => void;
  isExporting: boolean;
}

/** The list's settings tools: columns, statuses, tags and Excel export. */
export function LeadsPanelTools({
  canManageColumns,
  onExport,
  isExporting,
}: LeadsPanelToolsProps) {
  return (
    <>
      {canManageColumns && (
        <LeadTableColumnsDialog
          trigger={<ModuleSidePanelItem icon={Columns3} label="עמודות טבלה" />}
        />
      )}
      <ManageLeadStatusesDialog
        trigger={
          <ModuleSidePanelItem icon={Settings2} label="ניהול סטטוסי לידים" />
        }
      />
      <ChatTagsManager
        trigger={<ModuleSidePanelItem icon={Tag} label="ניהול תגיות" />}
      />
      <ModuleSidePanelItem
        icon={isExporting ? Loader2 : FileSpreadsheet}
        iconClassName={isExporting ? "animate-spin" : undefined}
        label="ייצוא לאקסל"
        title="ייצוא כל הלידים לפי הסינון לקובץ Excel"
        onClick={onExport}
        disabled={isExporting}
      />
    </>
  );
}

/** Lead intake at the bottom of the panel: archive, Facebook sync and import. */
export function LeadsPanelFooter({
  onSyncFacebook,
  isSyncingFacebook,
}: {
  onSyncFacebook: () => void;
  isSyncingFacebook: boolean;
}) {
  const { collapsed } = useModuleSidePanel();

  return (
    <>
      <PanelTooltip label="ארכיון" enabled={collapsed}>
        <Link
          to="archive"
          aria-label={collapsed ? "ארכיון" : undefined}
          className={cn(
            panelRowClassName(collapsed),
            "transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          <PanelRowContent
            icon={Archive}
            label="ארכיון"
            collapsed={collapsed}
          />
        </Link>
      </PanelTooltip>
      <ModuleSidePanelItem
        icon={Download}
        iconClassName={isSyncingFacebook ? "animate-spin" : undefined}
        label={isSyncingFacebook ? "מסנכרן..." : "סנכרן מפייסבוק"}
        onClick={onSyncFacebook}
        disabled={isSyncingFacebook}
      />
      <ImportLeadsWithMapping
        trigger={<ModuleSidePanelItem icon={Upload} label="ייבוא לידים" />}
      />
    </>
  );
}
