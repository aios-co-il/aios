import { Loader2, Mail, Unplug } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useMicrosoftConnection } from "./useMicrosoftConnection";

/** Connect, reconnect or disconnect the user's Microsoft 365 / Outlook account. */
export function MicrosoftConnectionCard({
  tenantId,
}: {
  tenantId: string | null | undefined;
}) {
  const { status, connect, disconnect } = useMicrosoftConnection(tenantId);
  const connection = status.data;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5" />
          חשבון Microsoft
        </CardTitle>
        <CardDescription>
          חיבור חשבון Microsoft 365 (עסקי) או Outlook.com (פרטי). Teams
          ו-OneDrive לעסקים זמינים רק בחשבון עסקי.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {status.isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : status.isError ? (
          <p className="text-sm text-destructive">שגיאה בבדיקת החיבור</p>
        ) : connection?.connected ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-medium">{connection.microsoft_email}</span>
            <Badge variant="secondary">
              {connection.account_type === "personal" ? "פרטי" : "עסקי"}
            </Badge>
            {connection.needs_reconnect && (
              <Badge variant="destructive">נדרש חיבור מחדש</Badge>
            )}
            {connection.needs_reconnect && (
              <Button
                size="sm"
                onClick={() => connect.mutate()}
                disabled={connect.isPending}
              >
                חיבור מחדש
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => disconnect.mutate()}
              disabled={disconnect.isPending}
            >
              <Unplug className="ml-2 h-4 w-4" />
              ניתוק
            </Button>
          </div>
        ) : (
          <Button onClick={() => connect.mutate()} disabled={connect.isPending}>
            {connect.isPending && (
              <Loader2 className="ml-2 h-4 w-4 animate-spin" />
            )}
            התחברות עם Microsoft
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
