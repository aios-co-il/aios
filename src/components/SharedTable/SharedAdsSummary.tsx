import { useQueryClient } from "@tanstack/react-query";
import { AdsGoalTables } from "@/components/reports/AdsGoalTables/AdsGoalTables";
import { AdsEntityLevelTabs } from "@/components/reports/AdsEntityLevelTabs";
import { Card, CardContent } from "@/components/ui/card";
import {
  ADS_ENTITY_LEVEL_LABELS,
  type AdsEntityLevel,
} from "@/lib/adsEntityLevel";
import {
  savePublicManualRoi,
  sharedTableKey,
  type SharedTableInfo,
  type SharedTableRecord,
} from "./publicTableApi";

type Props = {
  shareToken: string;
  table: SharedTableInfo;
  /** Every row of the period, before the entity level. */
  allRecords: Array<SharedTableRecord>;
  levelRecords: Array<SharedTableRecord>;
  previousRecords: Array<SharedTableRecord> | undefined;
  level: AdsEntityLevel;
  onLevelChange: (level: AdsEntityLevel) => void;
};

/**
 * An ads share's entity level tabs and the internal report's goal tables,
 * with the manual ROI card saving through the share link.
 */
export function SharedAdsSummary({
  shareToken,
  table,
  allRecords,
  levelRecords,
  previousRecords,
  level,
  onLevelChange,
}: Props) {
  const queryClient = useQueryClient();
  const hasRows = allRecords.length > 0;
  return (
    <>
      {hasRows && <AdsEntityLevelTabs value={level} onChange={onLevelChange} />}
      {hasRows && level !== "campaign" && levelRecords.length === 0 && (
        <Card className="border-dashed">
          <CardContent
            className="py-8 text-center text-sm text-muted-foreground"
            dir="rtl"
          >
            אין עדיין נתונים ברמת {ADS_ENTITY_LEVEL_LABELS[level]} בקישור זה.
          </CardContent>
        </Card>
      )}
      <AdsGoalTables
        table={table}
        records={levelRecords}
        previousRecords={previousRecords}
        level={level}
        // WooCommerce orders are read with a session, so a share has none.
        woo={null}
        manualRoi={{
          saveFn: async (manualRoi) => {
            await savePublicManualRoi(shareToken, manualRoi);
            await queryClient.invalidateQueries({
              queryKey: sharedTableKey(shareToken),
            });
          },
        }}
        // Notes on the account's conversion tracking are for the agency.
        showTrackingWarnings={false}
      />
    </>
  );
}
