import { useEffect, useRef, useState, type DragEvent } from "react";
import { Check, Loader2, Paperclip, Send, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { uploadCreativeAsset } from "./brandKit";
import {
  chatParts,
  fileLine,
  needsChatApproval,
  parseSseBuffer,
  parseUiAction,
  STUDIO_STALL_MESSAGE,
  STUDIO_STALL_MS,
  studioToolLine,
  uiActionLabel,
  type StudioUiAction,
} from "./studioChat";

type ChatEntry =
  | { kind: "user" | "assistant"; text: string }
  | { kind: "tool"; text: string }
  | {
      kind: "approval";
      action: StudioUiAction;
      status: "pending" | "done" | "dismissed";
    };

interface Props {
  tenantId: string;
  clientId: string | null;
  itemId: string;
  mode: "video" | "static";
  /** Built fresh on every send: what the studio has open right now. */
  contextAddon: () => string;
  /** Runs the action with the same handler as the studio button. */
  onUiAction: (action: StudioUiAction) => void;
  /** Data tools write the DB directly; the studio refetches after each turn. */
  onTurnDone: () => void;
  onClose: () => void;
}

const greeting = (mode: "video" | "static") =>
  mode === "video"
    ? "היי, אני כאן איתך על הסרטון. אפשר לבקש ממני לערוך סצנות, להחליף מנוע, להעלות לוגו או רפרנס (פשוט גררו לכאן), או להפיק את כל הסרט."
    : "היי, אני כאן איתך על הפוסט. גררו לכאן לוגו או רפרנס, בקשו וריאציות או תיקון לוריאציה שעל המסך, ואני אדאג לשאר.";

/** Carmen's answer: its text as written, and the pictures she shows (skin portraits) as images. */
function AssistantText({ text }: { text: string }) {
  return (
    <div className="me-6 whitespace-pre-wrap break-words rounded-lg bg-muted px-3 py-2 leading-relaxed">
      {chatParts(text).map((part, index) =>
        part.kind === "image" ? (
          <img
            key={index}
            src={part.url}
            alt={part.alt}
            loading="lazy"
            className="my-1 max-h-40 rounded-md"
          />
        ) : (
          <span key={index}>{part.text}</span>
        ),
      )}
    </div>
  );
}

/** Per project, kept while the studio is open so switching projects keeps each thread. */
const threads = new Map<string, ChatEntry[]>();

export function CreativeStudioChat({
  tenantId,
  clientId,
  itemId,
  mode,
  contextAddon,
  onUiAction,
  onTurnDone,
  onClose,
}: Props) {
  const [entries, setEntries] = useState<ChatEntry[]>(
    () => threads.get(itemId) ?? [],
  );
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setEntries(threads.get(itemId) ?? []);
    setDraft("");
    setStreaming("");
  }, [itemId]);

  useEffect(() => {
    threads.set(itemId, entries);
  }, [itemId, entries]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [entries, streaming]);

  const push = (entry: ChatEntry) => setEntries((list) => [...list, entry]);
  /** A progress line, once: the same line right after itself is not repeated. */
  const pushTool = (text: string) =>
    setEntries((list) => {
      const last = list[list.length - 1];
      return last?.kind === "tool" && last.text === text
        ? list
        : [...list, { kind: "tool", text }];
    });

  const handleAction = (action: StudioUiAction) => {
    if (action.item_id !== itemId) return;
    if (needsChatApproval(action))
      push({ kind: "approval", action, status: "pending" });
    else onUiAction(action);
  };

  const resolveApproval = (index: number, approve: boolean) => {
    setEntries((list) =>
      list.map((entry, i) => {
        if (i !== index || entry.kind !== "approval") return entry;
        if (approve) onUiAction(entry.action);
        return { ...entry, status: approve ? "done" : "dismissed" };
      }),
    );
  };

  const send = async (text: string) => {
    const message = text.trim();
    if (!message || busy) return;
    const history = entries
      .filter(
        (entry): entry is { kind: "user" | "assistant"; text: string } =>
          entry.kind === "user" || entry.kind === "assistant",
      )
      .slice(-20)
      .map((entry) => ({ role: entry.kind, content: entry.text }));
    push({ kind: "user", text: message });
    setDraft("");
    setBusy(true);
    let answer = "";
    // No stream event for STUDIO_STALL_MS: stop waiting instead of looking frozen.
    const controller = new AbortController();
    let stalled = false;
    let stallTimer: ReturnType<typeof setTimeout> | undefined;
    const armStallTimer = () => {
      clearTimeout(stallTimer);
      stallTimer = setTimeout(() => {
        stalled = true;
        controller.abort();
      }, STUDIO_STALL_MS);
    };
    armStallTimer();
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("לא מחובר");
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/run-ai-agent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            command_text: message,
            tenant_id: tenantId,
            client_id: clientId,
            surface: "internal_chat",
            stream: true,
            task_mode: "marketing_creative",
            task_skills: ["creative_studio"],
            system_prompt_addon: contextAddon(),
            conversation_history: history,
            user_name: "סטודיו קריאייטיב",
          }),
          signal: controller.signal,
        },
      );
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          (err as { message?: string }).message || "שגיאה בתקשורת עם כרמן",
        );
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const { events, rest } = parseSseBuffer(buffer);
        buffer = rest;
        if (events.length > 0) armStallTimer();
        for (const event of events) {
          if (event.type === "token" && typeof event.content === "string") {
            answer += event.content;
            setStreaming(answer);
          } else if (event.type === "tool_call") {
            pushTool(studioToolLine(event.tool));
          } else if (event.type === "ui_action") {
            const action = parseUiAction(event.action);
            if (action) handleAction(action);
          } else if (event.type === "done" && !answer) {
            if (typeof event.output === "string") answer = event.output;
            else if (event.error) throw new Error(String(event.error));
          }
        }
      }
      push({ kind: "assistant", text: answer.trim() || "סיימתי." });
    } catch (error: unknown) {
      if (stalled) {
        if (answer.trim()) push({ kind: "assistant", text: answer.trim() });
        push({ kind: "assistant", text: STUDIO_STALL_MESSAGE });
      } else {
        const text = error instanceof Error ? error.message : "שגיאה";
        push({ kind: "assistant", text: `לא הצלחתי: ${text}` });
      }
    } finally {
      clearTimeout(stallTimer);
      setStreaming("");
      setBusy(false);
      onTurnDone();
    }
  };

  const uploadFiles = async (files: File[]) => {
    if (files.length === 0) return;
    setUploading(true);
    try {
      const lines: string[] = [];
      for (const file of files.slice(0, 5)) {
        const asset = await uploadCreativeAsset({
          supabase,
          tenantId,
          itemId,
          file,
          kind: "reference",
        });
        lines.push(fileLine(asset.name, asset.url));
      }
      setDraft((current) =>
        [current.trim(), ...lines].filter(Boolean).join("\n"),
      );
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "ההעלאה נכשלה");
    } finally {
      setUploading(false);
    }
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    void uploadFiles(Array.from(event.dataTransfer.files));
  };

  return (
    <aside
      dir="rtl"
      aria-label="צ׳אט עם כרמן"
      className={cn(
        "flex w-[340px] shrink-0 flex-col border-s bg-background",
        dragging && "ring-2 ring-inset ring-pink-500",
      )}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <header className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="h-4 w-4 text-pink-600" />
          כרמן
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          aria-label="סגור צ׳אט"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </Button>
      </header>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3 text-sm">
        {entries.length === 0 && (
          <p className="rounded-lg bg-muted/60 p-3 leading-relaxed text-muted-foreground">
            {greeting(mode)}
          </p>
        )}
        {entries.map((entry, index) =>
          entry.kind === "tool" ? (
            <p key={index} className="text-xs text-muted-foreground">
              · {entry.text}
            </p>
          ) : entry.kind === "approval" ? (
            <div
              key={index}
              className="space-y-2 rounded-lg border border-pink-200 bg-pink-50/60 p-3 dark:border-pink-900 dark:bg-pink-950/30"
            >
              <p className="font-medium">{uiActionLabel(entry.action)}</p>
              {entry.status === "pending" ? (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="h-7 bg-pink-600 text-white hover:bg-pink-700"
                    onClick={() => resolveApproval(index, true)}
                  >
                    <Check className="me-1 h-3.5 w-3.5" />
                    אישור והפעלה
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7"
                    onClick={() => resolveApproval(index, false)}
                  >
                    לא עכשיו
                  </Button>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {entry.status === "done" ? "הופעל" : "בוטל"}
                </p>
              )}
            </div>
          ) : entry.kind === "user" ? (
            <p
              key={index}
              className="ms-6 whitespace-pre-wrap break-words rounded-lg bg-pink-600 px-3 py-2 leading-relaxed text-white"
            >
              {entry.text}
            </p>
          ) : (
            <AssistantText key={index} text={entry.text} />
          ),
        )}
        {streaming && <AssistantText text={streaming} />}
        {busy && !streaming && (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        )}
        <div ref={bottom} />
      </div>

      <form
        className="space-y-2 border-t p-2"
        onSubmit={(event) => {
          event.preventDefault();
          void send(draft);
        }}
      >
        <Textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void send(draft);
            }
          }}
          placeholder="כתבו לכרמן, או גררו קובץ…"
          className="min-h-[64px] resize-none text-sm"
          disabled={busy}
        />
        <div className="flex items-center justify-between">
          <input
            ref={fileInput}
            type="file"
            multiple
            accept="image/*,application/pdf"
            className="hidden"
            onChange={(event) => {
              void uploadFiles(Array.from(event.target.files ?? []));
              event.target.value = "";
            }}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1"
            disabled={uploading || busy}
            onClick={() => fileInput.current?.click()}
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Paperclip className="h-4 w-4" />
            )}
            קובץ
          </Button>
          <Button
            type="submit"
            size="sm"
            className="h-8 gap-1 bg-pink-600 text-white hover:bg-pink-700"
            disabled={busy || !draft.trim()}
          >
            <Send className="h-3.5 w-3.5" />
            שלח
          </Button>
        </div>
      </form>
    </aside>
  );
}
