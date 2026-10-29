/**
 * Whether the table's settings hold manual ROI figures someone entered. The
 * report keeps the manual ROI card for them even when the selected range has no
 * lead campaigns.
 */
export function hasManualRoiData(
  integrationSettings?: Record<string, unknown> | null,
): boolean {
  const manualRoi = integrationSettings?.manual_roi;
  if (!manualRoi || typeof manualRoi !== "object") {
    return false;
  }
  return (
    ("closures" in manualRoi && manualRoi.closures != null) ||
    ("revenue" in manualRoi && manualRoi.revenue != null)
  );
}
