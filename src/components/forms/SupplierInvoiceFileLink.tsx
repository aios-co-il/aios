import { useMutation } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  OPEN_URL_SECONDS,
  signSupplierInvoiceUrl,
  type SupplierInvoiceFile,
} from "./supplierInvoiceFiles";

const OPEN_LABEL = "פתיחת קובץ החשבונית";

const MS_PER_SECOND = 1000;

/** A file to open, and the tab that was opened for it at the click. */
type OpenRequest = { path: string; tab: Window | null };

/**
 * Shows the file in the tab opened at the click. Browsers block a tab opened
 * after the wait for the link, so the tab comes first and the link second.
 * When the browser blocked that tab, the user gets a button instead: a new
 * click is the only thing the browser lets open a tab.
 */
function showInTab(tab: Window | null, url: string) {
  if (!tab) {
    toast.info("הדפדפן חסם את פתיחת הקובץ", {
      duration: OPEN_URL_SECONDS * MS_PER_SECOND,
      action: {
        label: "פתיחת הקובץ",
        onClick: () => window.open(url, "_blank", "noopener,noreferrer"),
      },
    });

    return;
  }
  tab.opener = null;
  tab.location.replace(url);
}

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
    mutationFn: ({ path }: OpenRequest) => signSupplierInvoiceUrl(path),
    onSuccess: (url, { tab }) => {
      showInTab(tab, url);
    },
    onError: (error, { tab }) => {
      tab?.close();
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
        onClick={() =>
          openFile.mutate({ path: filePath, tab: window.open("", "_blank") })
        }
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
