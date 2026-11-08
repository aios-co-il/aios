import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import type {
  CallerKind,
  CallerPolicy,
} from "../../../../../supabase/functions/_shared/carmen/caller-policy/policy.ts";
import { Field, Toggle, TopicsField } from "./PolicyFields";
import { useSaveCallerPolicy } from "./useCallerPolicies";

const KIND_TEXT: Record<CallerKind, { title: string; description: string }> = {
  client: {
    title: "לקוח מוכר",
    description:
      "מי שהמספר שלו שייך ללקוח או לאיש קשר של לקוח. כרמן עונה רק על מה שמותר, ומעבירה בקשות לצוות.",
  },
  unknown: {
    title: "פונה חדש (מספר לא מוכר)",
    description:
      "מי שלא מזוהה כצוות או כלקוח. כרמן מספרת על השירות, מנסה לקבוע פגישה או משאירה הודעה.",
  },
};

/** Edits one caller kind's policy: free instructions, allowed and forbidden topics, actions. */
export function CallerPolicyCard({
  tenantId,
  kind,
  policy,
}: {
  tenantId: string;
  kind: CallerKind;
  policy: CallerPolicy;
}) {
  const [draft, setDraft] = useState(policy);
  const save = useSaveCallerPolicy(tenantId);
  const set = (patch: Partial<CallerPolicy>) =>
    setDraft((d) => ({ ...d, ...patch }));

  const onSave = () =>
    save.mutate(
      { kind, policy: draft },
      {
        onSuccess: () => toast.success("ההנחיות נשמרו"),
        onError: (e) => toast.error(`השמירה נכשלה: ${e.message}`),
      },
    );

  return (
    <Card dir="rtl">
      <CardHeader>
        <CardTitle className="text-base">{KIND_TEXT[kind].title}</CardTitle>
        <CardDescription>{KIND_TEXT[kind].description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Field id={`${kind}-instructions`} label="הנחיות כלליות">
          <Textarea
            id={`${kind}-instructions`}
            rows={4}
            value={draft.instructions}
            onChange={(e) => set({ instructions: e.target.value })}
          />
        </Field>
        <TopicsField
          id={`${kind}-allowed`}
          label="מותר לה לענות על (נושא בכל שורה)"
          topics={draft.allowedTopics}
          onChange={(allowedTopics) => set({ allowedTopics })}
        />
        <TopicsField
          id={`${kind}-forbidden`}
          label="אסור לה לדבר על (נושא בכל שורה)"
          topics={draft.forbiddenTopics}
          onChange={(forbiddenTopics) => set({ forbiddenTopics })}
        />
        <Toggle
          id={`${kind}-message`}
          label="רושמת הודעה ומעבירה לצוות"
          checked={draft.mayTakeMessage}
          onChange={(mayTakeMessage) => set({ mayTakeMessage })}
        />
        <Toggle
          id={`${kind}-meeting`}
          label="קובעת פגישה ביומן"
          checked={draft.mayBookMeeting}
          onChange={(mayBookMeeting) => set({ mayBookMeeting })}
        />
        <Button onClick={onSave} disabled={save.isPending}>
          {save.isPending ? "שומרת…" : "שמירה"}
        </Button>
      </CardContent>
    </Card>
  );
}
