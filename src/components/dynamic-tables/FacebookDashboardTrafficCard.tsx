import { Facebook } from "lucide-react";
import { SharedTrafficTable } from "@/components/SharedTable/SharedTrafficTable";
import type { FacebookCampaignRow } from "@/lib/adsMetrics";

type Props = {
  rows: FacebookCampaignRow[];
  formatCurrency: (value: number) => string;
  formatNumber: (value: number) => string;
};

/**
 * The Facebook traffic card of the internal and shared dashboards. It renders
 * the shared report's traffic table, so new followers read the same on every
 * traffic surface.
 */
export function FacebookDashboardTrafficCard({
  rows,
  formatCurrency,
  formatNumber,
}: Props) {
  return (
    <SharedTrafficTable
      rows={rows}
      entityColumnLabel="קמפיין"
      formatCurrency={formatCurrency}
      formatNumber={formatNumber}
      title={
        <>
          <Facebook className="h-5 w-5 text-blue-600" />
          קמפיינים טראפיק - Facebook
        </>
      }
    />
  );
}
