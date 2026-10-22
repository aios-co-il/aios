import { MoreVertical, Pencil, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ChatTopicMenuProps {
  /** When set, the menu shows a rename item. */
  onRename?: () => void;
  /** When set, the menu shows a delete item. */
  onDelete?: () => void;
}

export function ChatTopicMenu({ onRename, onDelete }: ChatTopicMenuProps) {
  return (
    <DropdownMenu dir="rtl">
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="אפשרויות לשיחה"
          title="אפשרויות"
          className="absolute left-1 top-2 flex h-6 w-6 items-center justify-center rounded-md text-[var(--cc-text-dim)] opacity-70 hover:bg-[rgba(76,195,255,0.12)] hover:text-[var(--cc-accent)] hover:opacity-100 focus-visible:opacity-100 group-hover:opacity-100"
        >
          <MoreVertical className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="cc-root cc-menu z-[90] min-w-[9rem] border-[var(--cc-line)] bg-[rgba(8,16,34,0.98)] text-[var(--cc-text)]"
      >
        {onRename && (
          <DropdownMenuItem
            className="cursor-pointer gap-2 text-right"
            onSelect={onRename}
          >
            <Pencil className="h-3.5 w-3.5" />
            שינוי שם
          </DropdownMenuItem>
        )}
        {onDelete && (
          <DropdownMenuItem
            className="cursor-pointer gap-2 text-right text-[var(--cc-crit)] focus:text-[var(--cc-crit)]"
            onSelect={onDelete}
          >
            <Trash2 className="h-3.5 w-3.5" />
            מחיקה
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
