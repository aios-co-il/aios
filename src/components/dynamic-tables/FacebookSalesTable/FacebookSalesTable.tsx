import { Fragment } from "react";
import { ReportNameCell } from "@/components/report-ui/ReportTable";
import { PreviousValueHead } from "@/components/reports/PreviousPeriod/PreviousValueCell";
import { Card } from "@/components/ui/card";
import {
  type FacebookTablePrevious,
  previousRowsOf,
} from "../facebookPreviousPeriod";
import type { FacebookReportEntry } from "../facebookReportCampaigns";
import { SalesCells } from "./SalesCells";
import { salesColumns, salesHeaders, totalResults } from "./salesColumns";

type Props = {
  rows: Array<FacebookReportEntry>;
  entityHeader: string;
  currency: string;
  /** The previous period; its columns show while it is set. */
  previous?: FacebookTablePrevious | null;
};

/**
 * The report's Facebook sales campaigns: purchases with ROAS when the account
 * tracks purchase value, cost per purchase when it does not. With the previous
 * period on, spend, purchases, value, ROAS or cost per purchase, leads and
 * cost per lead each get its value beside them.
 */
export function FacebookSalesTable({
  rows,
  entityHeader,
  currency,
  previous,
}: Props) {
  const campaigns = rows.map(([, campaign]) => campaign);
  const columns = salesColumns(campaigns);
  const compare = !!previous;
  return (
    <Card className="mb-4 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm" dir="rtl">
          <thead className="bg-muted/50 border-b">
            <tr>
              <th className="p-2 text-right font-medium">{entityHeader}</th>
              {salesHeaders(columns).map(({ label, compared }) => (
                <Fragment key={label}>
                  <th className="p-2 text-center font-medium">{label}</th>
                  {compare && compared && <PreviousValueHead />}
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(([groupKey, campaign]) => (
              <tr
                key={`ecom-${groupKey}`}
                className="border-b hover:bg-muted/30"
              >
                <ReportNameCell
                  name={campaign.name}
                  on={!campaign.off}
                  className="p-2 text-right"
                />
                <SalesCells
                  campaigns={[campaign]}
                  previous={previousRowsOf(previous, groupKey)}
                  columns={columns}
                  result={{
                    count: campaign.result.result_kind
                      ? campaign.result.results
                      : null,
                    label: campaign.result.result_label,
                  }}
                  currency={currency}
                  isTotal={false}
                />
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-primary/10 font-bold">
            <tr>
              <td className="p-2 text-right">סה״כ</td>
              <SalesCells
                campaigns={campaigns}
                previous={previousRowsOf(previous, null)}
                columns={columns}
                result={{ count: totalResults(campaigns), label: null }}
                currency={currency}
                isTotal
              />
            </tr>
          </tfoot>
        </table>
      </div>
    </Card>
  );
}
