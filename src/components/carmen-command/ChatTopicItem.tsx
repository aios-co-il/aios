import type { BrainRoute } from "@/lib/agentChannelRouting";
import { topicAgentLabel, topicAgentSprite } from "@/lib/agentSeats";
import { topicIsLive, topicTitle, type TopicChat } from "@/lib/chatTopics";

interface ChatTopicItemProps {
  conv: TopicChat;
  routes: BrainRoute[];
  active: boolean;
  hasMenu: boolean;
  onSelect: (chat: TopicChat) => void;
}

export function ChatTopicItem({
  conv,
  routes,
  active,
  hasMenu,
  onSelect,
}: ChatTopicItemProps) {
  const live = topicIsLive(conv.status);
  const agentLabel = topicAgentLabel(conv, routes);
  return (
    <button
      type="button"
      onClick={() => onSelect(conv)}
      title={agentLabel}
      style={hasMenu ? { paddingInlineEnd: 30 } : undefined}
      className={`cc-chat-topic ${active ? "is-active" : ""} ${live ? "is-live" : ""}`}
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
  );
}
