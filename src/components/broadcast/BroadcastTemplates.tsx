import { useState } from "react";
import {
  useMessageTemplates,
  type MessageTemplate,
  type TemplateChannel,
} from "@/hooks/useMessageTemplates";
import { TemplateEditorDialog } from "@/components/broadcast/TemplateEditorDialog";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Copy,
  FileText,
  Loader2,
  Mail,
  MessageSquare,
  Pencil,
  Trash2,
} from "lucide-react";

export { TemplateFieldPicker } from "@/components/broadcast/TemplateFieldPicker";

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
