import { Loader2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import {
  AUTO_SEND_KIND_LABELS,
  AUTO_SEND_TARGET_LABELS,
  CLIENT_AUTO_SEND_KINDS,
  CLIENT_AUTO_SEND_TARGETS,
  type ClientAutoSendKind,
  type ClientAutoSendTarget,
  MISSING_TARGET_HINTS,
} from "./clientAutoSendLabels";
import {
  type ClientAutoSendOptIn,
  isAutoSendOn,
  useClientAutoSendOptIns,
} from "./useClientAutoSendOptIns";
import {
  type ClientCardTargets,
  useClientCardTargets,
} from "./useClientCardTargets";
import { useSetClientAutoSend } from "./useSetClientAutoSend";

const READ_ONLY_HINT =
  "רק בעלים, בעלי סוכנות או מנהל הצוות של הלקוח יכולים לשנות";

const PERMISSION_CHECK_FAILED =
  "בדיקת ההרשאה לשינוי נכשלה, ולכן ההגדרה מוצגת לקריאה בלבד";

type SaveSwitch = ReturnType<typeof useSetClientAutoSend>;

/**
 * One switch per kind (rows) and target (columns). A switch is off limits
 * when the viewer may not manage the card, while another switch is being
 * saved, and while it is off for a target the card has no address of.
 */
export function AutoSendMatrix({ clientId }: { clientId: string }) {
  const { optIns, canManage } = useClientAutoSendOptIns(clientId);
  const card = useClientCardTargets(clientId);
  const save = useSetClientAutoSend(clientId);
  if (optIns.isPending || card.isPending || canManage.isPending) {
    return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
  }
  if (optIns.isError || card.isError) {
    return <p className="text-sm text-destructive">טעינת ההגדרה נכשלה</p>;
  }
  // A failed permission check leaves the switches read-only, and says so.
  const editable = canManage.data === true;
  return (
    <div className="space-y-2">
      {canManage.isError && (
        <p className="text-xs text-destructive">{PERMISSION_CHECK_FAILED}</p>
      )}
      {canManage.isSuccess && !editable && (
        <p className="text-xs text-muted-foreground">{READ_ONLY_HINT}</p>
      )}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40">
              <th />
              {CLIENT_AUTO_SEND_TARGETS.map((target) => (
                <TargetHeader
                  key={target}
                  target={target}
                  onCard={card.data.targets[target]}
                />
              ))}
            </tr>
          </thead>
          <tbody>
            {CLIENT_AUTO_SEND_KINDS.map((kind) => (
              <KindRow
                key={kind}
                kind={kind}
                optIns={optIns.data}
                card={card.data}
                editable={editable}
                save={save}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** A target's name, and why its switches are off limits when it is missing. */
function TargetHeader({
  target,
  onCard,
}: {
  target: ClientAutoSendTarget;
  onCard: boolean;
}) {
  return (
    <th scope="col" className="p-2 text-center text-xs font-medium">
      {AUTO_SEND_TARGET_LABELS[target]}
      {!onCard && (
        <span className="block font-normal text-muted-foreground">
          {MISSING_TARGET_HINTS[target]}
        </span>
      )}
    </th>
  );
}

/**
 * One kind's switches, one per target. A switch left on for a target the
 * card has since lost can still be turned off.
 */
function KindRow({
  kind,
  optIns,
  card,
  editable,
  save,
}: {
  kind: ClientAutoSendKind;
  optIns: ClientAutoSendOptIn[];
  card: ClientCardTargets;
  editable: boolean;
  save: SaveSwitch;
}) {
  return (
    <tr className="border-b last:border-0">
      <th scope="row" className="p-2 text-start font-normal">
        {AUTO_SEND_KIND_LABELS[kind]}
      </th>
      {CLIENT_AUTO_SEND_TARGETS.map((target) => {
        const checked = switchPosition(save, optIns, kind, target);
        return (
          <td key={target} className="p-2 text-center">
            <Switch
              aria-label={`${AUTO_SEND_KIND_LABELS[kind]}: ${AUTO_SEND_TARGET_LABELS[target]}`}
              checked={checked}
              disabled={
                !editable ||
                save.isPending ||
                (!checked && !card.targets[target])
              }
              onCheckedChange={(enabled) =>
                save.mutate({ client: card, kind, target, enabled })
              }
            />
          </td>
        );
      })}
    </tr>
  );
}

/** The saved position, or the one being saved for this switch. */
function switchPosition(
  save: SaveSwitch,
  optIns: ClientAutoSendOptIn[],
  kind: ClientAutoSendKind,
  target: ClientAutoSendTarget,
): boolean {
  const saving = save.isPending ? save.variables : undefined;
  if (saving?.kind === kind && saving.target === target) {
    return saving.enabled;
  }
  return isAutoSendOn(optIns, kind, target);
}
