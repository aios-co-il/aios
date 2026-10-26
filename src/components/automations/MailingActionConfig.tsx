import { Label } from "@/components/ui/label";
import {
  cfgText,
  type StepConfig,
  type StepConfigChange,
} from "@/lib/automationStepConfig";
import { Input } from "@/components/ui/input";
import { useMailingActionOptions } from "@/components/automations/useMailingActionOptions";
import {
  MailingEntitySelect,
  MailingListSelect,
  MailingTemplateSelect,
  MailingWhatsAppSelect,
} from "@/components/automations/MailingActionSelects";
import {
  MAILING_ACTIONS,
  isMailingAction,
} from "@/components/automations/mailingActions";
import { listKind } from "@/lib/broadcastListKind";

interface Props {
  tenantId?: string;
  actionType: string;
  configuration: StepConfig;
  onConfigChange: StepConfigChange;
}

export default function MailingActionConfig({
  tenantId,
  actionType,
  configuration,
  onConfigChange,
}: Props) {
  const action = isMailingAction(actionType)
    ? MAILING_ACTIONS[actionType]
    : null;
  const needsList = !!action?.needsList;
  const needsTemplate = !!action?.needsTemplate;
  const listKinds = action?.listKinds ?? [];
  const listOnlyStatic = !listKinds.includes("dynamic");

  const { lists, templates, waIntegrations } = useMailingActionOptions(
    tenantId,
    { needsList, needsTemplate },
  );

  const selectedTemplate = templates.find(
    (t) => t.id === configuration?.template_id,
  );
  const visibleLists = lists.filter(
    (l) =>
      listKinds.includes(listKind(l)) &&
      (!action?.crmFilterOnly || l.source === "crm_filter"),
  );

  return (
    <div className="space-y-4" dir="rtl">
      <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-3 text-right">
        <p className="text-xs text-blue-700">{action?.hint}</p>
      </div>

      {needsTemplate && (
        <MailingTemplateSelect
          templates={templates}
          value={cfgText(configuration?.template_id) || ""}
          onChange={(v) => onConfigChange("template_id", v)}
        />
      )}

      {needsList && (
        <MailingListSelect
          lists={visibleLists}
          listOnlyStatic={listOnlyStatic}
          value={cfgText(configuration?.list_id) || ""}
          onChange={(v) => onConfigChange("list_id", v)}
        />
      )}

      {action?.pickEntity && (
        <MailingEntitySelect
          value={cfgText(configuration?.entity) || "auto"}
          onChange={(v) => onConfigChange("entity", v)}
        />
      )}

      {needsTemplate && selectedTemplate?.channel === "whatsapp" && (
        <MailingWhatsAppSelect
          integrations={waIntegrations}
          value={cfgText(configuration?.integration_id) || "auto"}
          onChange={(v) =>
            onConfigChange("integration_id", v === "auto" ? null : v)
          }
        />
      )}

      {actionType === "send_template_to_list" && (
        <div className="space-y-2">
          <Label className="block text-right">
            מרווח מינימלי בין שליחות לרשימה (שעות)
          </Label>
          <Input
            type="number"
            min={0}
            value={cfgText(configuration?.min_interval_hours) ?? 24}
            onChange={(e) =>
              onConfigChange("min_interval_hours", Number(e.target.value))
            }
          />
        </div>
      )}
    </div>
  );
}
