import type { LucideIcon } from "lucide-react";
import { Copy, Pencil, Trash2 } from "lucide-react";
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

/** A contact link with its icon, or a dash when the value is empty. */
export function LinkCell({
  icon: Icon,
  href,
  external = false,
  children,
}: {
  icon: LucideIcon;
  href: string | null;
  external?: boolean;
  children: string | null;
}) {
  if (!href) {
    return <Empty />;
  }
  return (
    <a
      href={href}
      className="flex items-center gap-2 whitespace-nowrap text-sm transition-colors hover:text-brand-accent-700 dark:hover:text-brand-accent-400"
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
    >
      <Icon className="h-4 w-4 text-muted-foreground" />
      <span dir="ltr">{children}</span>
    </a>
  );
}

/** The dash an empty cell shows. */
export function Empty() {
  return <span className="text-muted-foreground">-</span>;
}
