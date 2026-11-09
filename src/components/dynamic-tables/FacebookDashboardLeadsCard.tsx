import { Facebook } from "lucide-react";
import { SharedLeadsTable } from "@/components/SharedTable/SharedLeadsTable";
import type { FacebookCampaignRow } from "@/lib/adsMetrics";

type Props = {
  rows: Array<FacebookCampaignRow>;
  formatCurrency: (value: number) => string;
  formatUnitCost: (value: number) => string;
  formatNumber: (value: number) => string;
};

/**
 * The Facebook leads card of the internal and shared dashboards. It renders
 * the shared report's leads table, so a profile campaign counted as leads
 * shows its new followers there too.
 */
export function FacebookDashboardLeadsCard({
  rows,
  formatCurrency,
  formatUnitCost,
  formatNumber,
}: Props) {
  return (
    <SharedLeadsTable
      rows={rows}
      entityColumnLabel="קמפיין"
      formatCurrency={formatCurrency}
      formatUnitCost={formatUnitCost}
      formatNumber={formatNumber}
      title={
        <>
          <Facebook className="h-5 w-5 text-blue-600" />
          קמפיינים לידים - Facebook
        </>
      }
    />
  );
}
