import { Loader2 } from "lucide-react";
import type { AdPreviewSource } from "./AdPreviewContext";
import { useAdPreview } from "./useAdPreview";

type Props = {
  source: AdPreviewSource;
  adId: string;
  adName: string;
};

/** Meta's mobile feed preview of one ad, framed from Meta's own preview page. */
export function FacebookAdPreviewFrame({ source, adId, adName }: Props) {
  const preview = useAdPreview(source, adId);

  return (
    <div className="flex min-h-[32rem] items-center justify-center">
      {preview.isPending && (
        <Loader2
          className="h-6 w-6 animate-spin text-muted-foreground"
          aria-label="טוען תצוגה מקדימה"
        />
      )}
      {preview.isError && (
        <p className="text-sm text-muted-foreground">
          לא ניתן לטעון את התצוגה המקדימה של המודעה כרגע.
        </p>
      )}
      {preview.data && (
        <iframe
          src={preview.data}
          title={`תצוגה מקדימה: ${adName}`}
          sandbox="allow-scripts allow-same-origin allow-popups"
          className="h-[32rem] w-full max-w-[22rem] border-0"
        />
      )}
    </div>
  );
}
