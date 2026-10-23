import { useState } from "react";
import { Plus } from "lucide-react";
import type { BrainRoute } from "@/lib/agentChannelRouting";
import type { TopicChat } from "@/lib/chatTopics";
import { ChatTopicItem } from "./ChatTopicItem";
import { ChatTopicMenu } from "./ChatTopicMenu";
import { ChatTopicRenameInput } from "./ChatTopicRenameInput";
import { DeleteChatDialog } from "./DeleteChatDialog";

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
          const renaming = renamingId === conv.id;
          return (
            <div key={conv.id} className="group relative">
              {renaming ? (
                <ChatTopicRenameInput
                  value={draft}
                  onChange={setDraft}
                  onCommit={() => commitRename(conv)}
                  onCancel={() => setRenamingId(null)}
                />
              ) : (
                <ChatTopicItem
                  conv={conv}
                  routes={routes}
                  active={activeId === conv.id}
                  hasMenu={hasMenu}
                  onSelect={onSelect}
                />
              )}
              {hasMenu && !renaming && (
                <ChatTopicMenu
                  onRename={
                    onRename &&
                    (() => {
                      setDraft(conv.title ?? "");
                      setRenamingId(conv.id);
                    })
                  }
                  onDelete={onDelete && (() => setToDelete(conv))}
                />
              )}
            </div>
          );
        })}
      </div>

      <DeleteChatDialog
        chat={toDelete}
        onCancel={() => setToDelete(null)}
        onConfirm={(conv) => void onDelete?.(conv)}
      />
    </aside>
  );
}
