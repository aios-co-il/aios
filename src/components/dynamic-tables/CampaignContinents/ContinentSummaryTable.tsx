import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Continent } from "./campaignContinent";
import { continentAnchor } from "./continentInputs";

/** One continent's row: its name and already formatted cells. */
export type ContinentSummaryRow = {
  continent: Continent;
  title: string;
  cells: Array<ReactNode>;
};

type Props = {
  rows: Array<ContinentSummaryRow>;
  /** The headers after "יבשת", one per cell. */
  headers: Array<string>;
  /** Header cells above the headers, e.g. a platform over its columns. */
  groups?: Array<{ label: string; span: number }>;
};

/** One row per continent; a continent's name jumps to its campaigns. */
export function ContinentSummaryTable({ rows, headers, groups }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>סיכום לפי יבשת</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              {groups && (
                <TableRow>
                  <TableHead />
                  {groups.map((group) => (
                    <TableHead
                      key={group.label}
                      colSpan={group.span}
                      className="text-center border-b"
                    >
                      {group.label}
                    </TableHead>
                  ))}
                </TableRow>
              )}
              <TableRow>
                {["יבשת", ...headers].map((label, index) => (
                  <TableHead key={`${label}-${index}`} className="text-right">
                    {label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ continent, title, cells }) => (
                <TableRow key={continent}>
                  <TableCell className="font-medium">
                    <a
                      href={`#${continentAnchor(continent)}`}
                      className="text-primary hover:underline"
                    >
                      {title}
                    </a>
                  </TableCell>
                  {cells.map((cell, index) => (
                    <TableCell key={index}>{cell}</TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
