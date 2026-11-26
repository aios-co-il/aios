import { useMutation } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  signSupplierInvoiceUrl,
  type SupplierInvoiceFile,
} from "./supplierInvoiceFiles";

const OPEN_LABEL = "פתיחת קובץ החשבונית";

/**
 * Opens an invoice's file. A row with a path gets a fresh one-minute link on
 * each click; a row from before paths were kept still has its stored link.
 */
export function SupplierInvoiceFileLink({
  invoice,
}: {
  invoice: SupplierInvoiceFile;
}) {
  const openFile = useMutation({
    mutationFn: signSupplierInvoiceUrl,
    onSuccess: (url) => {
      window.open(url, "_blank", "noopener,noreferrer");
    },
    onError: (error) => {
      console.error("supplier invoice file open failed:", error);
      toast.error("לא הצלחנו לפתוח את קובץ החשבונית");
    },
  });
  const { file_path: filePath, file_url: fileUrl } = invoice;

  if (filePath) {
    return (
      <Button
        variant="ghost"
        size="icon"
        aria-label={OPEN_LABEL}
        disabled={openFile.isPending}
        onClick={() => openFile.mutate(filePath)}
      >
        <Download className="h-4 w-4 text-primary" />
      </Button>
    );
  }
  if (fileUrl) {
    return (
      <a
        href={fileUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={OPEN_LABEL}
      >
        <Download className="h-4 w-4 text-primary hover:text-primary/80" />
      </a>
    );
  }

  return <>-</>;
}
