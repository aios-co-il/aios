import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ratio } from "@/lib/reportNumber";
import type { GoogleAdsFormatters } from "../GoogleAdsCampaignSection/types";
import type { ContinentSection } from "./continentSections";

type Props = GoogleAdsFormatters & { sections: Array<ContinentSection> };

/** One row per continent; a continent's name jumps to its campaigns. */
export function ContinentOverview({
  sections,
  formatCurrency,
  formatNumber,
}: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>סיכום לפי יבשת</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {HEADERS.map((label) => (
                  <TableHead key={label} className="text-right">
                    {label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sections.map(({ continent, title, campaigns, totals }) => {
                const cpa = ratio(totals.spend, totals.conversions);
                return (
                  <TableRow key={continent}>
                    <TableCell className="font-medium">
                      <a
                        href={`#continent-${continent}`}
                        className="text-primary hover:underline"
                      >
                        {title}
                      </a>
                    </TableCell>
                    <TableCell>{formatNumber(campaigns.length)}</TableCell>
                    <TableCell>{formatCurrency(totals.spend)}</TableCell>
                    <TableCell>{formatNumber(totals.clicks)}</TableCell>
                    <TableCell>{formatNumber(totals.conversions)}</TableCell>
                    <TableCell>{cpa > 0 ? formatCurrency(cpa) : "-"}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

const HEADERS = ["יבשת", "קמפיינים", "הוצאה", "קליקים", "המרות", "עלות להמרה"];
