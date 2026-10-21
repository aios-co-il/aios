interface ChatTopicRenameInputProps {
  value: string;
  onChange: (value: string) => void;
  onCommit: () => Promise<void> | void;
  onCancel: () => void;
}

export function ChatTopicRenameInput({
  value,
  onChange,
  onCommit,
  onCancel,
}: ChatTopicRenameInputProps) {
  return (
    <div className="cc-chat-topic is-active">
      <input
        autoFocus
        value={value}
        maxLength={80}
        aria-label="שם השיחה"
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => onCommit()}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void onCommit();
          } else if (e.key === "Escape") {
            e.stopPropagation();
            onCancel();
          }
        }}
        className="h-8 w-full rounded-md border border-[var(--cc-line-strong)] bg-[rgba(5,10,22,0.6)] px-2 text-right text-[13px] text-[var(--cc-text)] outline-none"
      />
    </div>
  );
}
