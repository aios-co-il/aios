import { useState } from "react";
import { MoreVertical, Pencil, Plus, Trash2 } from "lucide-react";
import type { BrainRoute } from "@/lib/agentChannelRouting";
import { topicAgentLabel, topicAgentSprite } from "@/lib/agentSeats";
import { topicIsLive, topicTitle, type TopicChat } from "@/lib/chatTopics";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface ChatTopicRailProps {
  items: TopicChat[];
  routes: BrainRoute[];
  activeId: string | null;
  onSelect: (chat: TopicChat) => void;
  onNew: () => void;
  /** When set, each chat gets a ⋮ menu with rename. */
  onRename?: (chat: TopicChat, title: string) => Promise<void> | void;
  /** When set, each chat gets a ⋮ menu with delete (after a confirm). */
  onDelete?: (chat: TopicChat) => Promise<void> | void;
  className?: string;
}

export function ChatTopicRail({
  items,
  routes,
  activeId,
  onSelect,
  onNew,
  onRename,
  onDelete,
  className = "",
}: ChatTopicRailProps) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [toDelete, setToDelete] = useState<TopicChat | null>(null);
  const hasMenu = !!(onRename || onDelete);

  const commitRename = async (conv: TopicChat) => {
    const title = draft.replace(/\s+/g, " ").trim();
    setRenamingId(null);
    if (title && title !== (conv.title ?? "")) await onRename?.(conv, title);
  };

  return (
    <aside className={`cc-chat-rail ${className}`.trim()}>
      <div className="mb-2 flex shrink-0 items-center justify-between gap-2 px-1">
        <span className="cc-panel-title">צ׳אטים</span>
        <button
          type="button"
          onClick={onNew}
          className="flex items-center gap-1 text-[11px] text-[var(--cc-accent)] hover:underline"
        >
          <Plus className="h-3.5 w-3.5" />
          חדש
        </button>
      </div>
      <div className="cc-scroll cc-chat-rail-list">
        {!items.length && (
          <p className="px-1 py-2 text-xs text-[var(--cc-text-dim)]">
            אין שיחות עדיין
          </p>
        )}
        {items.map((conv) => {
          const live = topicIsLive(conv.status);
          const agentLabel = topicAgentLabel(conv, routes);
          const renaming = renamingId === conv.id;
          return (
            <div key={conv.id} className="group relative">
              {renaming ? (
                <div className="cc-chat-topic is-active">
                  <input
                    autoFocus
                    value={draft}
                    maxLength={80}
                    aria-label="שם השיחה"
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={() => commitRename(conv)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void commitRename(conv);
                      } else if (e.key === "Escape") {
                        e.stopPropagation();
                        setRenamingId(null);
                      }
                    }}
                    className="h-8 w-full rounded-md border border-[var(--cc-line-strong)] bg-[rgba(5,10,22,0.6)] px-2 text-right text-[13px] text-[var(--cc-text)] outline-none"
                  />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => onSelect(conv)}
                  title={agentLabel}
                  style={hasMenu ? { paddingInlineEnd: 30 } : undefined}
                  className={`cc-chat-topic ${activeId === conv.id ? "is-active" : ""} ${live ? "is-live" : ""}`}
                >
                  <span className="cc-chat-topic-agent-wrap">
                    <img
                      src={topicAgentSprite(conv, routes)}
                      alt=""
                      aria-hidden
                      className="cc-chat-topic-agent"
                    />
                    {live && <span className="cc-chat-topic-dot is-live" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-right text-[13px]">
                      {topicTitle(conv.title)}
                    </span>
                    <span className="mt-0.5 flex items-center justify-end gap-2 text-[10px] text-[var(--cc-text-dim)]">
                      <span className="truncate">{agentLabel}</span>
                      <span className="cc-num shrink-0">
                        {new Date(conv.updated_at).toLocaleDateString("he-IL", {
                          day: "numeric",
                          month: "numeric",
                        })}
                      </span>
                    </span>
                  </span>
                </button>
              )}
              {hasMenu && !renaming && (
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
                        onSelect={() => {
                          setDraft(conv.title ?? "");
                          setRenamingId(conv.id);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        שינוי שם
                      </DropdownMenuItem>
                    )}
                    {onDelete && (
                      <DropdownMenuItem
                        className="cursor-pointer gap-2 text-right text-[var(--cc-crit)] focus:text-[var(--cc-crit)]"
                        onSelect={() => setToDelete(conv)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        מחיקה
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          );
        })}
      </div>

      <AlertDialog
        open={!!toDelete}
        onOpenChange={(open) => !open && setToDelete(null)}
      >
        <AlertDialogContent dir="rtl" className="z-[100] text-right">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-right">
              למחוק את השיחה?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-right">
              "{topicTitle(toDelete?.title)}" תימחק לצמיתות, עם כל ההודעות שבה.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                const conv = toDelete;
                setToDelete(null);
                if (conv) void onDelete?.(conv);
              }}
            >
              מחיקה
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </aside>
  );
}
