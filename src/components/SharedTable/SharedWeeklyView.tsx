import { useQuery } from "@tanstack/react-query";
import { WeeklyCampaignComparison } from "@/components/reports/WeeklyCampaignComparison";
import { getCurrencySymbol } from "@/lib/currency";
import { weeklySourceModesForTable } from "@/lib/weeklyCampaignGoals";
import {
  fetchPublicTable,
  sharedTableKey,
  type SharedTableInfo,
} from "./publicTableApi";
import type { AdsPlatform } from "./sharedIntegrationReport";

type Props = {
  shareToken: string;
  table: SharedTableInfo;
  source: AdsPlatform;
};

/** The weekly campaign comparison over the share link's last year. */
export function SharedWeeklyView({ shareToken, table, source }: Props) {
  const { data, isPending } = useQuery({
    queryKey: [...sharedTableKey(shareToken), "last_365_days", "weekly"],
    queryFn: () =>
      fetchPublicTable(shareToken, {
        date_filter: "last_365_days",
        seo_part: "core",
      }),
    staleTime: 5 * 60_000,
    retry: false,
  });
  const currency = table.integration_settings?.currency;
  return (
    <WeeklyCampaignComparison
      records={data?.records || []}
      defaultSource={source}
      currency={getCurrencySymbol(
        typeof currency === "string" ? currency : null,
      )}
      isLoading={isPending}
      tables={[table]}
      sourceModes={weeklySourceModesForTable(
        table.integration_settings,
        table.category,
      )}
    />
  );
}
