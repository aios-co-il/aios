import { useAdPreviewSource } from "./AdPreviewContext";
import { FacebookAdPreviewFrame } from "./FacebookAdPreviewFrame";
import { PreviewableNameCell } from "./PreviewableNameCell";

type Props = {
  name: string;
  /** Paused, removed or its report switched off. */
  off: boolean;
  /** The Meta ad id of an ad-level row; other rows have none. */
  adId?: string | null;
};

/**
 * The name cell of a Facebook report row. An ad row's name opens the ad's
 * preview where the report has a preview source (the internal page and its
 * share link); every other row is the plain name cell.
 */
export function FacebookEntityNameCell({ name, off, adId }: Props) {
  const source = useAdPreviewSource();

  return (
    <PreviewableNameCell
      name={name}
      off={off}
      description="תצוגה מקדימה של המודעה בפיד במובייל"
      preview={
        source && adId ? (
          <FacebookAdPreviewFrame source={source} adId={adId} adName={name} />
        ) : null
      }
    />
  );
}
