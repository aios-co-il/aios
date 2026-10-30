import { Badge } from "@/components/ui/badge";
import { ClientUpdateSourceChip } from "@/components/clients/ClientUpdateSourceChip";
import { DISPLAY_UPDATE_TYPES } from "@/components/clients/clientUpdateTypeOptions";
import { isHumanClientCardSource } from "../../../supabase/functions/_shared/client-card/sources.ts";

/** The type badge and source chip above a client card entry; nothing for an untyped human note. */
export function ClientUpdateBadges({
  updateType,
  source,
}: {
  updateType?: string | null;
  source?: string | null;
}) {
  const typeOption = updateType
    ? DISPLAY_UPDATE_TYPES.find((option) => option.value === updateType)
    : undefined;
  if (!typeOption && isHumanClientCardSource(source)) {
    return null;
  }
  return (
    <div className="mb-2 flex flex-wrap items-center gap-1">
      {typeOption && (
        <Badge variant="outline" className="gap-1 text-xs bg-card">
          <typeOption.icon className="h-3 w-3" />
          {typeOption.label}
        </Badge>
      )}
      <ClientUpdateSourceChip source={source} />
    </div>
  );
}
