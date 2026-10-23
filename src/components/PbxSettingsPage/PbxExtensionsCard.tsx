import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { PbxExtension, PbxSettingsData } from "./types";

interface Agent {
  id: string;
  full_name: string | null;
  email: string | null;
}

interface Props {
  form: PbxSettingsData;
  agents: Agent[];
  setExtension: (
    userId: string,
    patch: Partial<Omit<PbxExtension, "user_id">>,
  ) => void;
}

export function PbxExtensionsCard({ form, agents, setExtension }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>שלוחות לפי נציג</CardTitle>
        <CardDescription>
          השלוחה ומספר המתקשר שיישלחו כשהנציג מחייג. ריק = ברירת המחדל. השלוחה
          משמשת גם לשיוך שיחות נכנסות לנציג.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {agents.length === 0 ? (
          <p className="text-sm text-muted-foreground">אין משתמשים בארגון</p>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-3 text-xs text-muted-foreground font-medium">
              <span>נציג</span>
              <span>שלוחה</span>
              <span>מספר מתקשר</span>
            </div>
            {agents.map((agent) => {
              const ext = form.extensions.find((e) => e.user_id === agent.id);
              return (
                <div
                  key={agent.id}
                  className="grid grid-cols-3 gap-3 items-center"
                >
                  <span className="text-sm truncate">
                    {agent.full_name || agent.email}
                  </span>
                  <Input
                    dir="ltr"
                    value={ext?.extension || ""}
                    onChange={(e) =>
                      setExtension(agent.id, { extension: e.target.value })
                    }
                    placeholder={form.default_extension || "101"}
                  />
                  <Input
                    dir="ltr"
                    value={ext?.caller_number || ""}
                    onChange={(e) =>
                      setExtension(agent.id, { caller_number: e.target.value })
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
  );
}
