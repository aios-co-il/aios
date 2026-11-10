import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Save } from "lucide-react";
import type { ZoomCredentials } from "./useZoomSettings";

interface ZoomCredentialsCardProps {
  form: ZoomCredentials;
  onChange: (form: ZoomCredentials) => void;
  onSave: () => void;
  saving: boolean;
  isConnected: boolean;
}

const FIELDS: Array<{
  key: keyof ZoomCredentials;
  label: string;
  secret?: boolean;
}> = [
  { key: "accountId", label: "Account ID" },
  { key: "clientId", label: "Client ID" },
  { key: "clientSecret", label: "Client Secret", secret: true },
];

/** The Server-to-Server OAuth form for the tenant's Zoom app. */
export function ZoomCredentialsCard({
  form,
  onChange,
  onSave,
  saving,
  isConnected,
}: ZoomCredentialsCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Server-to-Server OAuth Credentials</CardTitle>
        <CardDescription>
          הזן את פרטי האפליקציה מ-Zoom App Marketplace
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {FIELDS.map((field) => (
            <div key={field.key} className="space-y-2">
              <Label htmlFor={`zoom-${field.key}`}>{field.label}</Label>
              <Input
                id={`zoom-${field.key}`}
                dir="ltr"
                type={field.secret ? "password" : "text"}
                value={form[field.key]}
                onChange={(e) =>
                  onChange({ ...form, [field.key]: e.target.value })
                }
                placeholder={field.label}
              />
            </div>
          ))}
        </div>
        <Button onClick={onSave} disabled={saving}>
          <Save className="h-4 w-4 ml-2" />
          {saving ? "שומר..." : "שמור הגדרות"}
        </Button>
        {isConnected && <Badge className="mr-2 bg-primary/90">✓ מחובר</Badge>}
      </CardContent>
    </Card>
  );
}
