import { lazy, Suspense, useMemo, useRef, useState } from "react";
import DOMPurify from "dompurify";
import {
  useMessageTemplates,
  type MessageTemplate,
  type TemplateChannel,
} from "@/hooks/useMessageTemplates";
import { useBroadcastLists } from "@/hooks/useBroadcastLists";
import { useCurrentTenant } from "@/hooks/useCurrentTenant";
import { supabase } from "@/integrations/supabase/client";
import type { EmailRichEditorHandle } from "@/components/broadcast/EmailRichEditor";
import {
  STANDARD_TEMPLATE_FIELDS,
  buildTemplateVars,
  renderTemplate,
  templateFieldKeys,
  textToEmailHtml,
  wrapEmailHtml,
  type TemplateVars,
} from "../../../supabase/functions/_shared/broadcast-template.ts";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Braces,
  Copy,
  FileText,
  Loader2,
  Mail,
  MessageSquare,
  Pencil,
  Plus,
  Send,
  Trash2,
} from "lucide-react";

const EmailRichEditor = lazy(
  () => import("@/components/broadcast/EmailRichEditor"),
);

const SAMPLE_VARS: TemplateVars = buildTemplateVars({
  contact_name: "ישראל ישראלי",
  company_name: "חברה לדוגמה בע״מ",
  email: "israel@example.com",
  phone: "972501234567",
  agency_name: "הסוכנות שלי",
  campaigner_name: "דנה כהן",
  lead_stage: "פגישה נקבעה",
  lead_status: "חם",
  client_status: "פעיל",
});

/** "{{field}}" insert menu: standard fields plus custom columns of a list. */
export function TemplateFieldPicker({
  onPick,
  customKeys = [],
  size = "sm",
}: {
  onPick: (token: string) => void;
  customKeys?: string[];
  size?: "sm" | "default";
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size={size}>
          <Braces className="ml-1 h-4 w-4" />
          שדה דינמי
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="max-h-80 overflow-y-auto z-[100]"
      >
        <DropdownMenuLabel>שדות אנשי קשר</DropdownMenuLabel>
        {STANDARD_TEMPLATE_FIELDS.map((f) => (
          <DropdownMenuItem key={f.key} onSelect={() => onPick(`{{${f.key}}}`)}>
            <span className="flex-1">{f.label}</span>
            <code className="text-xs text-muted-foreground" dir="ltr">
              {f.key}
            </code>
          </DropdownMenuItem>
        ))}
        {customKeys.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>עמודות מהרשימה</DropdownMenuLabel>
            {customKeys.map((k) => (
              <DropdownMenuItem key={k} onSelect={() => onPick(`{{${k}}}`)}>
                <code className="text-xs">{k}</code>
              </DropdownMenuItem>
            ))}
          </>
        )}
        <DropdownMenuSeparator />
        <div className="px-2 py-1 text-xs text-muted-foreground">
          ערך ברירת מחדל: <code dir="ltr">{"{{first_name|חבר/ה}}"}</code>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function BroadcastTemplates() {
  const { list, archive, duplicate } = useMessageTemplates();
  const [editing, setEditing] = useState<
    MessageTemplate | { channel: TemplateChannel } | null
  >(null);

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex gap-2">
        <Button onClick={() => setEditing({ channel: "email" })}>
          <Mail className="ml-1 h-4 w-4" /> טמפלייט מייל
        </Button>
        <Button
          variant="secondary"
          onClick={() => setEditing({ channel: "whatsapp" })}
        >
          <MessageSquare className="ml-1 h-4 w-4" /> טמפלייט וואטסאפ
        </Button>
      </div>

      {list.isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : (list.data || []).length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">
          <FileText className="mx-auto mb-2 h-8 w-8 opacity-50" />
          אין טמפלייטים עדיין. טמפלייט נשמר פעם אחת ונשלח לרשימות או מאוטומציות.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(list.data || []).map((t) => (
            <Card
              key={t.id}
              className="cursor-pointer hover:border-primary"
              onClick={() => setEditing(t)}
            >
              <CardContent className="space-y-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="font-medium">{t.name}</div>
                  <Badge variant="outline" className="shrink-0 text-xs">
                    {t.channel === "email" ? "מייל" : "וואטסאפ"}
                  </Badge>
                </div>
                <p className="line-clamp-2 text-sm text-muted-foreground">
                  {t.channel === "email"
                    ? t.subject || "ללא נושא"
                    : t.body_text || "—"}
                </p>
                <div
                  className="flex gap-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setEditing(t)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => duplicate.mutate(t)}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      if (confirm("להעביר את הטמפלייט לארכיון?"))
                        archive.mutate(t.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {editing && (
        <TemplateEditorDialog
          template={"id" in editing ? editing : null}
          channel={editing.channel}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function TemplateEditorDialog({
  template,
  channel,
  onClose,
}: {
  template: MessageTemplate | null;
  channel: TemplateChannel;
  onClose: () => void;
}) {
  const { tenantId } = useCurrentTenant();
  const { save } = useMessageTemplates();
  const { lists, useMembers } = useBroadcastLists();
  const [name, setName] = useState(template?.name || "");
  const [subject, setSubject] = useState(template?.subject || "");
  const [bodyHtml, setBodyHtml] = useState(template?.body_html || "");
  const [bodyText, setBodyText] = useState(template?.body_text || "");
  const [mediaUrl, setMediaUrl] = useState(template?.media_url || "");
  const [uploading, setUploading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [sampleListId, setSampleListId] = useState<string | undefined>();
  const editorRef = useRef<EmailRichEditorHandle>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const subjectRef = useRef<HTMLInputElement>(null);
  const [focus, setFocus] = useState<"subject" | "body">("body");

  const staticLists = (lists.data || []).filter((l) => l.kind === "static");
  const members = useMembers(sampleListId);
  const sampleMember = (members.data || [])[0];
  const customKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const m of members.data || [])
      for (const k of Object.keys(m.custom_fields || {})) keys.add(k);
    return [...keys];
  }, [members.data]);

  const previewVars: TemplateVars = sampleMember
    ? buildTemplateVars({
        contact_name: sampleMember.name,
        email: sampleMember.email,
        phone: sampleMember.phone,
        extra: sampleMember.custom_fields || {},
      })
    : SAMPLE_VARS;

  const insertInto = (
    el: HTMLInputElement | HTMLTextAreaElement | null,
    value: string,
    set: (v: string) => void,
    token: string,
  ) => {
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    set(value.slice(0, start) + token + value.slice(end));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const insertField = (token: string) => {
    if (channel === "email" && focus === "subject")
      return insertInto(subjectRef.current, subject, setSubject, token);
    if (channel === "email") return editorRef.current?.insertText(token);
    insertInto(textRef.current, bodyText, setBodyText, token);
  };

  const previewHtml = useMemo(() => {
    if (channel !== "email") return "";
    const raw = bodyHtml
      ? wrapEmailHtml(renderTemplate(bodyHtml, previewVars, { html: true }))
      : textToEmailHtml(renderTemplate(bodyText, previewVars));
    return DOMPurify.sanitize(raw);
  }, [channel, bodyHtml, bodyText, previewVars]);

  const unknownKeys = useMemo(() => {
    const known = new Set([
      ...STANDARD_TEMPLATE_FIELDS.map((f) => f.key),
      "name",
      ...customKeys,
    ]);
    return templateFieldKeys(`${subject} ${bodyHtml} ${bodyText}`).filter(
      (k) => !known.has(k),
    );
  }, [subject, bodyHtml, bodyText, customKeys]);

  const uploadImage = async (file: File) => {
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${tenantId}/templates/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from("broadcast-media")
        .upload(path, file);
      if (error) throw error;
      setMediaUrl(
        supabase.storage.from("broadcast-media").getPublicUrl(path).data
          .publicUrl,
      );
    } catch (e: any) {
      toast.error("העלאת התמונה נכשלה: " + (e?.message || ""));
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) return toast.error("צריך שם לטמפלייט");
    if (channel === "email" && !subject.trim())
      return toast.error("צריך נושא למייל");
    if (channel === "whatsapp" && !bodyText.trim())
      return toast.error("צריך תוכן להודעה");
    try {
      await save.mutateAsync({
        id: template?.id,
        name: name.trim(),
        channel,
        subject: channel === "email" ? subject.trim() : null,
        body_html: channel === "email" ? DOMPurify.sanitize(bodyHtml) : null,
        body_text: channel === "whatsapp" ? bodyText : null,
        media_url: channel === "whatsapp" ? mediaUrl || null : null,
      });
      toast.success("הטמפלייט נשמר");
      onClose();
    } catch (e: any) {
      toast.error("שמירה נכשלה: " + (e?.message || ""));
    }
  };

  const sendTest = async () => {
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "broadcast-test-send",
        {
          body: {
            tenantId,
            subject,
            bodyHtml: DOMPurify.sanitize(bodyHtml),
            vars: previewVars,
          },
        },
      );
      if (error || data?.error) throw new Error(data?.error || error?.message);
      toast.success(`נשלח מייל בדיקה אל ${data.to}`);
    } catch (e: any) {
      toast.error("שליחת בדיקה נכשלה: " + (e?.message || ""));
    } finally {
      setTesting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className="max-h-[92vh] max-w-5xl overflow-y-auto"
        dir="rtl"
      >
        <DialogHeader>
          <DialogTitle>
            {template ? "עריכת טמפלייט" : "טמפלייט חדש"} ·{" "}
            {channel === "email" ? "מייל" : "וואטסאפ"}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>שם הטמפלייט</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <TemplateFieldPicker
                onPick={insertField}
                customKeys={customKeys}
              />
              <Select
                value={sampleListId ?? "none"}
                onValueChange={(v) =>
                  setSampleListId(v === "none" ? undefined : v)
                }
              >
                <SelectTrigger className="h-9 w-48">
                  <SelectValue placeholder="תצוגה לפי רשימה" />
                </SelectTrigger>
                <SelectContent className="z-[100]">
                  <SelectItem value="none">נתוני דוגמה</SelectItem>
                  {staticLists.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {channel === "email" ? (
              <>
                <div className="space-y-1">
                  <Label>נושא</Label>
                  <Input
                    ref={subjectRef}
                    value={subject}
                    onFocus={() => setFocus("subject")}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="היי {{first_name}}, יש לנו עדכון בשבילך"
                  />
                </div>
                <div
                  className="space-y-1"
                  onFocusCapture={() => setFocus("body")}
                >
                  <Label>תוכן</Label>
                  <Suspense
                    fallback={
                      <div className="flex h-[260px] items-center justify-center rounded-md border">
                        <Loader2 className="h-5 w-5 animate-spin" />
                      </div>
                    }
                  >
                    <EmailRichEditor
                      ref={editorRef}
                      initialHtml={template?.body_html || ""}
                      onChange={setBodyHtml}
                    />
                  </Suspense>
                  <p className="text-xs text-muted-foreground">
                    הקלד / לכותרות, רשימות ותמונות. קישור להסרה מהרשימה מתווסף
                    אוטומטית.
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="space-y-1">
                  <Label>הודעה</Label>
                  <Textarea
                    ref={textRef}
                    rows={8}
                    value={bodyText}
                    onChange={(e) => setBodyText(e.target.value)}
                    placeholder="היי {{first_name}} 👋"
                  />
                </div>
                <div className="space-y-1">
                  <Label>תמונה (אופציונלי)</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="file"
                      accept="image/*"
                      onChange={(e) =>
                        e.target.files?.[0] && uploadImage(e.target.files[0])
                      }
                    />
                    {uploading && <Loader2 className="h-4 w-4 animate-spin" />}
                    {mediaUrl && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setMediaUrl("")}
                      >
                        הסר
                      </Button>
                    )}
                  </div>
                </div>
              </>
            )}

            {unknownKeys.length > 0 && (
              <p className="text-xs text-amber-600">
                שדות שלא מוכרים (יוצגו ריקים אם חסרים לנמען):{" "}
                {unknownKeys.map((k) => (
                  <code key={k} className="mx-1">
                    {k}
                  </code>
                ))}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>
              תצוגה מקדימה
              {sampleMember
                ? ` · ${sampleMember.name || sampleMember.email || sampleMember.phone}`
                : " · נתוני דוגמה"}
            </Label>
            {channel === "email" ? (
              <div className="rounded-md border bg-white p-4 text-black">
                <div className="mb-3 border-b pb-2 text-sm font-semibold">
                  {renderTemplate(subject, previewVars) || "ללא נושא"}
                </div>
                <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
              </div>
            ) : (
              <div className="rounded-md border bg-[#e5ddd5] p-4">
                <div className="max-w-[85%] whitespace-pre-wrap rounded-lg bg-[#dcf8c6] p-3 text-sm text-black shadow-sm">
                  {mediaUrl && (
                    <img
                      src={mediaUrl}
                      alt=""
                      className="mb-2 max-h-48 rounded"
                    />
                  )}
                  {renderTemplate(bodyText, previewVars) || "—"}
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2">
          {channel === "email" && (
            <Button variant="outline" onClick={sendTest} disabled={testing}>
              {testing ? (
                <Loader2 className="ml-1 h-4 w-4 animate-spin" />
              ) : (
                <Send className="ml-1 h-4 w-4" />
              )}
              שלח בדיקה אליי
            </Button>
          )}
          <Button onClick={handleSave} disabled={save.isPending}>
            {save.isPending ? (
              <Loader2 className="ml-1 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="ml-1 h-4 w-4" />
            )}
            שמור טמפלייט
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
