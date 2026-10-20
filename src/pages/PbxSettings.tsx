import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Copy,
  PhoneCall,
  RefreshCw,
  Save,
  Webhook,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { useTenant } from "@/contexts/TenantContext";
import { useTenantPath } from "@/hooks/useTenantPath";
import { supabase } from "@/integrations/supabase/client";

interface PbxExtension {
  user_id: string;
  extension: string;
  caller_number?: string;
}

interface PbxSettingsData {
  name: string;
  outbound_url: string;
  outbound_method: "POST" | "GET";
  outbound_format: "json" | "form";
  outbound_auth_header: string;
  outbound_auth_value: string;
  param_caller: string;
  param_destination: string;
  param_extension: string;
  param_call_id: string;
  default_caller_number: string;
  default_extension: string;
  extensions: PbxExtension[];
  inbound_secret: string;
}

const EMPTY: PbxSettingsData = {
  name: "",
  outbound_url: "",
  outbound_method: "POST",
  outbound_format: "json",
  outbound_auth_header: "",
  outbound_auth_value: "",
  param_caller: "caller",
  param_destination: "destination",
  param_extension: "extension",
  param_call_id: "call_id",
  default_caller_number: "",
  default_extension: "",
  extensions: [],
  inbound_secret: "",
};

function generateSecret() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="bg-muted px-1 py-0.5 rounded font-mono text-xs" dir="ltr">
      {children}
    </code>
  );
}

function CodeBlock({ code }: { code: string }) {
  return (
    <pre
      className="bg-muted rounded-md p-3 text-xs font-mono overflow-x-auto whitespace-pre"
      dir="ltr"
    >
      {code}
    </pre>
  );
}

export default function PbxSettings() {
  const { currentTenantId } = useTenant();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { buildPath } = useTenantPath();
  const queryClient = useQueryClient();

  const [form, setForm] = useState<PbxSettingsData>(EMPTY);
  const [isActive, setIsActive] = useState(true);
  const set = <K extends keyof PbxSettingsData>(
    key: K,
    value: PbxSettingsData[K],
  ) => setForm((prev) => ({ ...prev, [key]: value }));

  const { data: integration, isLoading } = useQuery({
    queryKey: ["generic-pbx-integration", currentTenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_integrations")
        .select("*")
        .eq("tenant_id", currentTenantId!)
        .eq("integration_type", "generic_pbx")
        .is("user_id", null)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!currentTenantId,
  });

  useEffect(() => {
    if (isLoading) return;
    const saved = (integration?.settings || {}) as Partial<PbxSettingsData>;
    setForm({
      ...EMPTY,
      ...saved,
      extensions: Array.isArray(saved.extensions) ? saved.extensions : [],
      inbound_secret: saved.inbound_secret || generateSecret(),
    });
    setIsActive(integration ? !!integration.is_active : true);
  }, [integration, isLoading]);

  const { data: users = [] } = useQuery({
    queryKey: ["pbx-tenant-users", currentTenantId],
    queryFn: async () => {
      const { data: tu } = await supabase
        .from("tenant_users")
        .select("user_id")
        .eq("tenant_id", currentTenantId!);
      const ids = (tu || []).map((r) => r.user_id);
      if (!ids.length) return [];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", ids);
      return (profiles || []).sort((a, b) =>
        (a.full_name || a.email || "").localeCompare(
          b.full_name || b.email || "",
        ),
      );
    },
    enabled: !!currentTenantId,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!currentTenantId) throw new Error("No tenant");
      if (form.outbound_url && !/^https?:\/\//i.test(form.outbound_url))
        throw new Error("כתובת ה-Webhook היוצא חייבת להתחיל ב-http או https");
      const settings = {
        ...form,
        extensions: form.extensions.filter((e) => e.extension.trim()),
      };
      if (integration) {
        const { error } = await supabase
          .from("tenant_integrations")
          .update({ settings: settings as any, is_active: isActive })
          .eq("id", integration.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("tenant_integrations").insert({
          tenant_id: currentTenantId,
          integration_type: "generic_pbx",
          settings: settings as any,
          is_active: isActive,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["generic-pbx-integration", currentTenantId],
      });
      toast({ title: "נשמר בהצלחה", description: "הגדרות המרכזיה נשמרו" });
    },
    onError: (err: Error) =>
      toast({
        title: "שגיאה",
        description: err.message,
        variant: "destructive",
      }),
  });

  const extensionFor = (userId: string) =>
    form.extensions.find((e) => e.user_id === userId);
  const setExtension = (
    userId: string,
    patch: Partial<Omit<PbxExtension, "user_id">>,
  ) =>
    setForm((prev) => {
      const current = prev.extensions.find((e) => e.user_id === userId) || {
        user_id: userId,
        extension: "",
        caller_number: "",
      };
      return {
        ...prev,
        extensions: [
          ...prev.extensions.filter((e) => e.user_id !== userId),
          { ...current, ...patch },
        ],
      };
    });

  const inboundUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pbx-webhook?tenant_id=${currentTenantId}&secret=${form.inbound_secret}`;
  const inboundUrlNoSecret = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pbx-webhook?tenant_id=${currentTenantId}`;

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "הועתק!", description: "הטקסט הועתק ללוח" });
  };

  const outboundExample = useMemo(() => {
    const p = {
      [form.param_caller || "caller"]:
        form.default_caller_number || "035551234",
      [form.param_destination || "destination"]: "0501234567",
      [form.param_extension || "extension"]: form.default_extension || "101",
      [form.param_call_id || "call_id"]: "8f1c2e4a-...-uuid",
    };
    const headers = [
      form.outbound_method === "GET"
        ? null
        : form.outbound_format === "form"
          ? "Content-Type: application/x-www-form-urlencoded"
          : "Content-Type: application/json",
      form.outbound_auth_header ? `${form.outbound_auth_header}: ••••••` : null,
    ].filter(Boolean);
    const target = form.outbound_url || "https://your-pbx.example.com/dial";
    if (form.outbound_method === "GET") {
      const qs = new URLSearchParams(p).toString();
      return `GET ${target}${target.includes("?") ? "&" : "?"}${qs}\n${headers.join("\n")}`;
    }
    const body =
      form.outbound_format === "form"
        ? new URLSearchParams(p).toString()
        : JSON.stringify(p, null, 2);
    return `POST ${target}\n${headers.join("\n")}\n\n${body}`;
  }, [form]);

  const jsonExample = `curl -X POST "${inboundUrlNoSecret}" \\
  -H "Content-Type: application/json" \\
  -H "x-webhook-secret: ${form.inbound_secret}" \\
  -d '{
    "call_id": "8f1c2e4a-...-uuid",
    "caller": "0501234567",
    "called": "035551234",
    "extension": "101",
    "direction": "inbound",
    "status": "answered",
    "duration": 125,
    "recording_url": "https://your-pbx.example.com/recordings/abc.mp3"
  }'`;

  const fileExample = `curl -X POST "${inboundUrlNoSecret}" \\
  -H "x-webhook-secret: ${form.inbound_secret}" \\
  -F "caller=0501234567" \\
  -F "called=035551234" \\
  -F "extension=101" \\
  -F "duration=125" \\
  -F "recording_file=@/path/to/call.mp3"`;

  const responseExample = `{
  "ok": true,
  "call_log_id": "…",
  "lead_id": "…",      // הליד ששויך (null אם לא נמצא)
  "client_id": null,
  "matched": true
}`;

  return (
    <div className="container mx-auto p-6 space-y-6" dir="rtl">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate(buildPath("lead-integrations"))}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <PhoneCall className="h-8 w-8" />
            חיבור מרכזיה
          </h1>
          <p className="text-muted-foreground mt-1">
            חיוג מה-CRM דרך Webhook יוצא, וקליטת הקלטות שיחה ששויכות אוטומטית
            לליד לפי מספר הטלפון
          </p>
        </div>
        {integration?.is_active && (
          <Badge className="bg-primary/90">✓ מחובר</Badge>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>פרטי המרכזיה</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>שם המרכזיה</Label>
            <Input
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="לדוגמה: מרכזיית משרד"
            />
          </div>
          <div className="flex items-center gap-3 pt-7">
            <Switch checked={isActive} onCheckedChange={setIsActive} />
            <Label>{isActive ? "פעיל" : "מושבת"}</Label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Webhook className="h-5 w-5" />
            Webhook יוצא — חיוג מה-CRM למרכזיה
          </CardTitle>
          <CardDescription>
            בלחיצה על "חייג" בכרטיס ליד, המערכת שולחת לכתובת הזו את מספר המתקשר,
            המספר אליו מתקשרים ומספר השלוחה של הנציג
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2 md:col-span-2">
              <Label>כתובת ה-Webhook של המרכזיה</Label>
              <Input
                dir="ltr"
                value={form.outbound_url}
                onChange={(e) => set("outbound_url", e.target.value)}
                placeholder="https://your-pbx.example.com/api/dial"
              />
            </div>
            <div className="space-y-2">
              <Label>שיטה</Label>
              <Select
                value={form.outbound_method}
                onValueChange={(v) =>
                  set(
                    "outbound_method",
                    v as PbxSettingsData["outbound_method"],
                  )
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="POST">POST</SelectItem>
                  <SelectItem value="GET">GET</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>פורמט גוף</Label>
              <Select
                value={form.outbound_format}
                disabled={form.outbound_method === "GET"}
                onValueChange={(v) =>
                  set(
                    "outbound_format",
                    v as PbxSettingsData["outbound_format"],
                  )
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="json">JSON</SelectItem>
                  <SelectItem value="form">Form (urlencoded)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>כותרת אימות (אופציונלי)</Label>
              <Input
                dir="ltr"
                value={form.outbound_auth_header}
                onChange={(e) => set("outbound_auth_header", e.target.value)}
                placeholder="Authorization"
              />
            </div>
            <div className="space-y-2">
              <Label>ערך כותרת האימות</Label>
              <Input
                dir="ltr"
                type="password"
                value={form.outbound_auth_value}
                onChange={(e) => set("outbound_auth_value", e.target.value)}
                placeholder="Bearer xxxxx"
              />
            </div>
          </div>

          <div>
            <Label className="text-sm font-semibold">
              שמות השדות שהמרכזיה מצפה לקבל
            </Label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-2">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">
                  מספר המתקשר
                </Label>
                <Input
                  dir="ltr"
                  value={form.param_caller}
                  onChange={(e) => set("param_caller", e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">
                  המספר אליו מתקשרים
                </Label>
                <Input
                  dir="ltr"
                  value={form.param_destination}
                  onChange={(e) => set("param_destination", e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">
                  מספר שלוחה
                </Label>
                <Input
                  dir="ltr"
                  value={form.param_extension}
                  onChange={(e) => set("param_extension", e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">
                  מזהה שיחה
                </Label>
                <Input
                  dir="ltr"
                  value={form.param_call_id}
                  onChange={(e) => set("param_call_id", e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>מספר מתקשר ברירת מחדל</Label>
              <Input
                dir="ltr"
                value={form.default_caller_number}
                onChange={(e) => set("default_caller_number", e.target.value)}
                placeholder="035551234"
              />
            </div>
            <div className="space-y-2">
              <Label>שלוחה ברירת מחדל</Label>
              <Input
                dir="ltr"
                value={form.default_extension}
                onChange={(e) => set("default_extension", e.target.value)}
                placeholder="101"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-semibold">דוגמת בקשה שתישלח</Label>
            <CodeBlock code={outboundExample} />
            <p className="text-xs text-muted-foreground">
              <Code>call_id</Code> הוא מזהה השיחה במערכת. כדאי שהמרכזיה תחזיר
              אותו ב-Webhook ההקלטה כדי שההקלטה תשויך בדיוק לשיחה הזו.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>שלוחות לפי נציג</CardTitle>
          <CardDescription>
            השלוחה ומספר המתקשר שיישלחו כשהנציג מחייג. ריק = ברירת המחדל. השלוחה
            משמשת גם לשיוך שיחות נכנסות לנציג.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {users.length === 0 ? (
            <p className="text-sm text-muted-foreground">אין משתמשים בארגון</p>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-3 gap-3 text-xs text-muted-foreground font-medium">
                <span>נציג</span>
                <span>שלוחה</span>
                <span>מספר מתקשר</span>
              </div>
              {users.map((u) => {
                const ext = extensionFor(u.id);
                return (
                  <div
                    key={u.id}
                    className="grid grid-cols-3 gap-3 items-center"
                  >
                    <span className="text-sm truncate">
                      {u.full_name || u.email}
                    </span>
                    <Input
                      dir="ltr"
                      value={ext?.extension || ""}
                      onChange={(e) =>
                        setExtension(u.id, { extension: e.target.value })
                      }
                      placeholder={form.default_extension || "101"}
                    />
                    <Input
                      dir="ltr"
                      value={ext?.caller_number || ""}
                      onChange={(e) =>
                        setExtension(u.id, { caller_number: e.target.value })
                      }
                      placeholder={form.default_caller_number || "035551234"}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Webhook className="h-5 w-5" />
            Webhook נכנס — קליטת הקלטות שיחה
          </CardTitle>
          <CardDescription>
            הגדר במרכזיה לשלוח לכתובת הזו את פרטי השיחה וההקלטה בסיום כל שיחה.
            ההקלטה תשויך לליד שהטלפון שלו תואם למספר המתקשר.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label>כתובת ה-Webhook</Label>
            <div className="flex gap-2">
              <Input
                value={inboundUrl}
                readOnly
                dir="ltr"
                className="font-mono text-xs"
              />
              <Button variant="outline" onClick={() => copy(inboundUrl)}>
                <Copy className="h-4 w-4 ml-2" />
                העתק
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label>סוד (Secret)</Label>
            <div className="flex gap-2">
              <Input
                value={form.inbound_secret}
                readOnly
                dir="ltr"
                className="font-mono text-xs"
              />
              <Button
                variant="outline"
                onClick={() => set("inbound_secret", generateSecret())}
              >
                <RefreshCw className="h-4 w-4 ml-2" />
                החלף
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              שלח את הסוד בכותרת <Code>x-webhook-secret</Code> או בפרמטר{" "}
              <Code>secret</Code> ב-URL. אחרי החלפת הסוד יש לשמור ולעדכן את
              המרכזיה.
            </p>
          </div>

          {!integration && (
            <Alert>
              <AlertTitle>יש לשמור קודם</AlertTitle>
              <AlertDescription>
                ה-Webhook הנכנס יתחיל לעבוד אחרי שמירת ההגדרות.
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-3">
            <h3 className="font-semibold">דוקומנטציה</h3>
            <p className="text-sm text-muted-foreground">
              שיטה: <Code>POST</Code> (או <Code>GET</Code> עם פרמטרים ב-URL).
              פורמטים נתמכים: <Code>application/json</Code>,{" "}
              <Code>application/x-www-form-urlencoded</Code>,{" "}
              <Code>multipart/form-data</Code> (להעלאת קובץ הקלטה).
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border rounded-md">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="p-2 text-right">שדה</th>
                    <th className="p-2 text-right">שמות חלופיים</th>
                    <th className="p-2 text-right">תיאור</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  <tr>
                    <td className="p-2">
                      <Code>caller</Code>
                    </td>
                    <td className="p-2 text-xs">
                      <Code>from, cli, callerid, ani, src</Code>
                    </td>
                    <td className="p-2">
                      מספר המתקשר — לפיו מזוהה הליד בשיחה נכנסת
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2">
                      <Code>called</Code>
                    </td>
                    <td className="p-2 text-xs">
                      <Code>to, destination, did, dnis, dst</Code>
                    </td>
                    <td className="p-2">המספר אליו התקשרו</td>
                  </tr>
                  <tr>
                    <td className="p-2">
                      <Code>extension</Code>
                    </td>
                    <td className="p-2 text-xs">
                      <Code>ext, agent_extension</Code>
                    </td>
                    <td className="p-2">שלוחת הנציג — משייכת את השיחה לנציג</td>
                  </tr>
                  <tr>
                    <td className="p-2">
                      <Code>recording_url</Code>
                    </td>
                    <td className="p-2 text-xs">
                      <Code>recording, record_url</Code>
                    </td>
                    <td className="p-2">קישור http(s) להקלטה</td>
                  </tr>
                  <tr>
                    <td className="p-2">
                      <Code>recording_file</Code>
                    </td>
                    <td className="p-2 text-xs">
                      <Code>file, audio</Code>
                    </td>
                    <td className="p-2">
                      קובץ אודיו (multipart, עד 50MB) — במקום קישור
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2">
                      <Code>call_id</Code>
                    </td>
                    <td className="p-2 text-xs">
                      <Code>callid, uniqueid, call_uuid</Code>
                    </td>
                    <td className="p-2">
                      מזהה השיחה. אותו מזהה שנשלח ב-Webhook היוצא מעדכן את אותה
                      שיחה
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2">
                      <Code>direction</Code>
                    </td>
                    <td className="p-2 text-xs">
                      <Code>inbound / outbound</Code>
                    </td>
                    <td className="p-2">
                      כיוון השיחה. ביוצאת, הליד מזוהה לפי המספר אליו התקשרו
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2">
                      <Code>lead_phone</Code>
                    </td>
                    <td className="p-2 text-xs">
                      <Code>customer_phone, phone</Code>
                    </td>
                    <td className="p-2">
                      אופציונלי: טלפון הלקוח במפורש (גובר על הכיוון)
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2">
                      <Code>status</Code>
                    </td>
                    <td className="p-2 text-xs">
                      <Code>call_status, disposition</Code>
                    </td>
                    <td className="p-2">
                      answered / no-answer / busy / failed
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2">
                      <Code>duration</Code>
                    </td>
                    <td className="p-2 text-xs">
                      <Code>call_duration, billsec</Code>
                    </td>
                    <td className="p-2">משך השיחה בשניות</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="space-y-1 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">
                איך ההקלטה משויכת לליד:
              </p>
              <ol className="list-decimal list-inside space-y-1">
                <li>
                  אם נשלח <Code>call_id</Code> של שיחה קיימת — ההקלטה מתווספת
                  לשיחה ולליד שלה.
                </li>
                <li>
                  אחרת המערכת מחפשת ליד (ואז לקוח) שהטלפון שלו תואם ל-9 הספרות
                  האחרונות של מספר המתקשר.
                </li>
                <li>אם אין ליד תואם, השיחה נשמרת ללא שיוך.</li>
              </ol>
              <p>ההקלטה מופיעה בלשונית "שיחות" בכרטיס הליד.</p>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-semibold">
                דוגמה: קישור להקלטה (JSON)
              </Label>
              <CodeBlock code={jsonExample} />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold">
                דוגמה: העלאת קובץ הקלטה
              </Label>
              <CodeBlock code={fileExample} />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold">תשובה</Label>
              <CodeBlock code={responseExample} />
              <p className="text-xs text-muted-foreground">
                קודי שגיאה: <Code>400</Code> בקשה שגויה, <Code>403</Code> סוד
                שגוי, <Code>404</Code> מרכזיה לא מוגדרת או מושבתת,{" "}
                <Code>413</Code> קובץ גדול מדי, <Code>415</Code> קובץ שאינו
                אודיו.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Button
        onClick={() => saveMutation.mutate()}
        disabled={saveMutation.isPending || isLoading}
        size="lg"
      >
        <Save className="h-4 w-4 ml-2" />
        {saveMutation.isPending ? "שומר..." : "שמור הגדרות"}
      </Button>
    </div>
  );
}
