import { Copy, RefreshCw, Webhook } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Code } from "./Code";
import { PbxInboundDocs } from "./PbxInboundDocs";
import { generateSecret, type SetPbxField } from "./types";

interface Props {
  tenantId: string | null | undefined;
  secret: string;
  set: SetPbxField;
  isSaved: boolean;
}

function ReadOnlyRow({
  value,
  action,
}: {
  value: string;
  action: React.ReactNode;
}) {
  return (
    <div className="flex gap-2">
      <Input value={value} readOnly dir="ltr" className="font-mono text-xs" />
      {action}
    </div>
  );
}

export function PbxInboundCard({ tenantId, secret, set, isSaved }: Props) {
  const { toast } = useToast();
  const baseUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pbx-webhook?tenant_id=${tenantId}`;
  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "הועתק!", description: "הטקסט הועתק ללוח" });
  };

  return (
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
          <ReadOnlyRow
            value={baseUrl}
            action={
              <Button variant="outline" onClick={() => copy(baseUrl)}>
                <Copy className="h-4 w-4 ml-2" />
                העתק
              </Button>
            }
          />
        </div>
        <div className="space-y-2">
          <Label>סוד (Secret)</Label>
          <ReadOnlyRow
            value={secret}
            action={
              <>
                <Button variant="outline" onClick={() => copy(secret)}>
                  <Copy className="h-4 w-4 ml-2" />
                  העתק
                </Button>
                <Button
                  variant="outline"
                  onClick={() => set("inbound_secret", generateSecret())}
                >
                  <RefreshCw className="h-4 w-4 ml-2" />
                  החלף
                </Button>
              </>
            }
          />
          <p className="text-xs text-muted-foreground">
            שלח את הסוד בכותרת <Code>x-webhook-secret</Code>. רק אם המרכזיה לא
            תומכת בכותרות, אפשר להוסיף <Code>&secret=…</Code> ל-URL (הסוד יופיע
            אז בלוגים של המרכזיה). אחרי החלפת הסוד יש לשמור ולעדכן את המרכזיה.
          </p>
        </div>

        {!isSaved && (
          <Alert>
            <AlertTitle>יש לשמור קודם</AlertTitle>
            <AlertDescription>
              ה-Webhook הנכנס יתחיל לעבוד אחרי שמירת ההגדרות.
            </AlertDescription>
          </Alert>
        )}

        <PbxInboundDocs url={baseUrl} secret={secret} />
      </CardContent>
    </Card>
  );
}
