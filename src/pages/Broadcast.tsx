import { useState } from "react";
import {
  useBroadcasts,
  type Broadcast,
  type BroadcastStatus,
} from "@/hooks/useBroadcasts";
import { BroadcastWizard } from "@/components/broadcast/BroadcastWizard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { BroadcastLists } from "@/components/broadcast/BroadcastLists";
import { BroadcastDomainSettings } from "@/components/broadcast/BroadcastDomainSettings";
import { BroadcastTemplates } from "@/components/broadcast/BroadcastTemplates";
import { BroadcastStatsDialog } from "@/components/broadcast/stats/BroadcastStatsDialog";
import { OpenRateCell } from "@/components/broadcast/stats/OpenRateCell";
import {
  Send,
  Plus,
  Trash2,
  MessageSquare,
  Loader2,
  Users,
  Globe,
  FileText,
  Zap,
  BarChart3,
} from "lucide-react";
import { toast } from "sonner";

const STATUS_LABEL: Record<
  BroadcastStatus,
  {
    label: string;
    variant: "default" | "secondary" | "destructive" | "outline";
  }
> = {
  draft: { label: "טיוטה", variant: "outline" },
  scheduled: { label: "מתוזמן", variant: "secondary" },
  sending: { label: "בשליחה", variant: "default" },
  sent: { label: "נשלח", variant: "secondary" },
  paused: { label: "מושהה", variant: "outline" },
  failed: { label: "נכשל", variant: "destructive" },
  canceled: { label: "בוטל", variant: "outline" },
};

export default function Broadcast() {
  const { list, remove } = useBroadcasts();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [statsFor, setStatsFor] = useState<Broadcast | null>(null);

  const broadcasts = (list.data || []) as Broadcast[];

  const handleDelete = (id: string) => {
    if (!confirm("למחוק את הדיוור?")) return;
    remove.mutate(id, {
      onSuccess: () => toast.success("הדיוור נמחק"),
      onError: (e) => toast.error("שגיאה במחיקה: " + (e?.message || "")),
    });
  };

  return (
    <div className="container mx-auto p-4 space-y-4" dir="rtl">
      <div className="flex items-center gap-2">
        <Send className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">דיוור</h1>
      </div>

      <Tabs defaultValue="broadcasts">
        <TabsList>
          <TabsTrigger value="broadcasts">
            <Send className="ml-1 h-4 w-4" />
            דיוורים
          </TabsTrigger>
          <TabsTrigger value="lists">
            <Users className="ml-1 h-4 w-4" />
            רשימות תפוצה
          </TabsTrigger>
          <TabsTrigger value="templates">
            <FileText className="ml-1 h-4 w-4" />
            טמפלייטים
          </TabsTrigger>
          <TabsTrigger value="settings">
            <Globe className="ml-1 h-4 w-4" />
            הגדרות שולח
          </TabsTrigger>
        </TabsList>

        <TabsContent value="broadcasts" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setWizardOpen(true)}>
              <Plus className="ml-1 h-4 w-4" /> דיוור חדש
            </Button>
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">דיוורים</CardTitle>
            </CardHeader>
            <CardContent>
              {list.isLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : broadcasts.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  <MessageSquare className="mx-auto mb-2 h-8 w-8 opacity-50" />
                  עדיין אין דיוורים. צור דיוור חדש כדי להתחיל.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">שם</TableHead>
                      <TableHead className="text-right">ערוץ</TableHead>
                      <TableHead className="text-right">סטטוס</TableHead>
                      <TableHead className="text-right">נמענים</TableHead>
                      <TableHead className="text-right">נשלחו</TableHead>
                      <TableHead className="text-right">נמסר</TableHead>
                      <TableHead className="text-right">נפתח</TableHead>
                      <TableHead className="text-right">קליקים</TableHead>
                      <TableHead className="text-right">נכשלו</TableHead>
                      <TableHead className="text-right">נוצר</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {broadcasts.map((b) => {
                      const st = STATUS_LABEL[b.status] || STATUS_LABEL.draft;
                      return (
                        <TableRow
                          key={b.id}
                          className="cursor-pointer"
                          onClick={() => setStatsFor(b)}
                        >
                          <TableCell className="font-medium">
                            {b.origin === "automation" && (
                              <Zap
                                className="ml-1 inline h-3 w-3 text-amber-500"
                                aria-label="אוטומציה"
                              />
                            )}
                            {b.name}
                          </TableCell>
                          <TableCell>
                            {b.channel === "email"
                              ? "אימייל · Resend"
                              : `WhatsApp · ${b.provider === "manus_wa" ? "Manus" : "Green API"}`}
                          </TableCell>
                          <TableCell>
                            <Badge variant={st.variant}>{st.label}</Badge>
                          </TableCell>
                          <TableCell>{b.stats?.total ?? 0}</TableCell>
                          <TableCell>{b.stats?.sent ?? 0}</TableCell>
                          <TableCell>
                            {b.channel === "email"
                              ? (b.stats?.delivered ?? 0)
                              : "—"}
                          </TableCell>
                          <TableCell>
                            <OpenRateCell broadcast={b} />
                          </TableCell>
                          <TableCell>
                            {b.channel === "email"
                              ? (b.stats?.clicked ?? 0)
                              : "—"}
                          </TableCell>
                          <TableCell>
                            {b.stats?.failed ? (
                              <span className="text-destructive">
                                {b.stats.failed}
                              </span>
                            ) : (
                              0
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {new Date(b.created_at).toLocaleDateString("he-IL")}
                          </TableCell>
                          <TableCell
                            className="whitespace-nowrap"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="סטטיסטיקות"
                              onClick={() => setStatsFor(b)}
                            >
                              <BarChart3 className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDelete(b.id)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="lists">
          <BroadcastLists />
        </TabsContent>

        <TabsContent value="templates">
          <BroadcastTemplates />
        </TabsContent>

        <TabsContent value="settings">
          <BroadcastDomainSettings />
        </TabsContent>
      </Tabs>

      {statsFor && (
        <BroadcastStatsDialog
          broadcast={statsFor}
          onClose={() => setStatsFor(null)}
        />
      )}

      <BroadcastWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        onDone={() => list.refetch()}
      />
    </div>
  );
}
