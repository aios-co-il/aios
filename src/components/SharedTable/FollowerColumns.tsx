import { TableCell, TableHead } from "@/components/ui/table";
import {
  FOLLOWER_COLUMN_LABELS,
  formatFollowerCell,
} from "@/lib/facebookFollowers";

/** Headers of the new-followers and cost-per-follower columns. */
export function FollowerHeads() {
  return (
    <>
      <TableHead className="text-right">
        {FOLLOWER_COLUMN_LABELS.newFollowers}
      </TableHead>
      <TableHead className="text-right">
        {FOLLOWER_COLUMN_LABELS.costPerFollower}
      </TableHead>
    </>
  );
}

/** New followers and cost per follower of a row, or a dash for each missing. */
export function FollowerCells({
  newFollowers,
  costPerFollower,
  formatNumber,
  formatUnitCost,
}: {
  newFollowers: number | null;
  costPerFollower: number | null;
  formatNumber: (value: number) => string;
  formatUnitCost: (value: number) => string;
}) {
  return (
    <>
      <TableCell>{formatFollowerCell(newFollowers, formatNumber)}</TableCell>
      <TableCell>
        {formatFollowerCell(costPerFollower, formatUnitCost)}
      </TableCell>
    </>
  );
}
