import { useState } from "react";
import { toast } from "sonner";
import { downloadReportPdf } from "@/lib/reportPdf";

/**
 * Downloads the summary as a PDF. With no stored screenshot, it photographs
 * the summary at the card's window first, as a send does.
 */
export function useExportReportPdf(
  capture: () => Promise<Blob>,
  fileName: string,
) {
  const [exporting, setExporting] = useState(false);

  /** Photographs the summary and saves it as a PDF. */
  async function exportPdf() {
    setExporting(true);
    try {
      await downloadReportPdf(await capture(), fileName);
      toast.success("קובץ ה-PDF נוצר");
    } catch (error) {
      console.error("Report PDF export failed:", error);
      toast.error("יצוא ה-PDF נכשל");
    } finally {
      setExporting(false);
    }
  }

  return { exportPdf, exporting };
}
