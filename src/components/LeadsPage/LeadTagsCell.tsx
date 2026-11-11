import {
  LeadTagBadges,
  LeadTagSelector,
} from "@/components/leads/LeadTagSelector";

type ChatTag = Parameters<typeof LeadTagBadges>[0]["allTags"][number];

/** The lead's tags as soft chips, with the tag picker beside them. */
export function LeadTagsCell({
  leadId,
  allTags,
  tagIds,
}: {
  leadId: string;
  allTags: Array<ChatTag>;
  tagIds: Array<string>;
}) {
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <div className="min-w-0 flex-1 overflow-hidden">
        {tagIds.length > 0 ? (
          <LeadTagBadges allTags={allTags} tagIds={tagIds} />
        ) : (
          <span className="text-xs text-muted-foreground">אין תגיות</span>
        )}
      </div>
      <LeadTagSelector leadId={leadId} initialTagIds={tagIds} />
    </div>
  );
}
