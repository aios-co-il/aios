import type { LucideIcon } from "lucide-react";
import { Copy, Globe, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ClientRow } from "./clientRow";

/** The actions column: open in chat, duplicate and delete. */
export function RowActions({
  client,
  onOpen,
  onDuplicate,
  onDelete,
}: {
  client: ClientRow;
  onOpen: (clientId: string) => void;
  onDuplicate: (client: { id: string; name: string }) => void;
  onDelete: (client: ClientRow) => void;
}) {
  return (
    <div className="flex gap-1">
      <RowAction icon={Pencil} title="ערוך" onClick={() => onOpen(client.id)} />
      <RowAction
        icon={Copy}
        title="שכפל לקוח"
        onClick={() => onDuplicate({ id: client.id, name: client.name })}
      />
      <RowAction
        icon={Trash2}
        title="מחק לקוח"
        danger
        onClick={() => onDelete(client)}
      />
    </div>
  );
}

/** A ghost icon button in the actions column. */
function RowAction({
  icon: Icon,
  title,
  danger = false,
  onClick,
}: {
  icon: LucideIcon;
  title: string;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      size="icon"
      variant="ghost"
      title={title}
      onClick={onClick}
      className={cn(
        "h-8 w-8",
        danger && "hover:bg-surface-status-red hover:text-destructive",
      )}
    >
      <Icon className="h-4 w-4" />
    </Button>
  );
}

/** A link to the client's website in a new tab, or a dash when it has none. */
export function WebsiteCell({ website }: { website: string | null }) {
  if (!website) {
    return <Empty />;
  }
  return (
    <a
      href={website}
      className="flex items-center gap-2 whitespace-nowrap text-sm transition-colors hover:text-brand-accent-700 dark:hover:text-brand-accent-400"
      target="_blank"
      rel="noopener noreferrer"
    >
      <Globe className="h-4 w-4 text-muted-foreground" />
      <span>קישור</span>
    </a>
  );
}

/** The dash an empty cell shows. */
export function Empty() {
  return <span className="text-muted-foreground">-</span>;
}
