import { ExternalLink, FileText, Globe, Link2, Paperclip, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { hostLabel } from "../../../supabase/functions/_shared/workshop/assets.ts";
import { MAX_USER_REFERENCES, canBeReference, type WorkshopAsset } from "./workshopAssets";

export function AssetCard({
  asset,
  referencesFull,
  onToggleReference,
  onDelete,
}: {
  asset: WorkshopAsset;
  referencesFull: boolean;
  onToggleReference: (asset: WorkshopAsset) => void;
  onDelete: (asset: WorkshopAsset) => void;
}) {
  const colors = Array.isArray(
    (asset.meta.report as { colors?: unknown } | undefined)?.colors,
  )
    ? ((asset.meta.report as { colors: string[] }).colors ?? [])
    : [];
  const inspected = !!asset.meta.inspected_at;
  const isPicture = asset.asset_type === "image" && !!asset.url;
  const Icon =
    asset.asset_type === "site"
      ? Globe
      : asset.asset_type === "link"
        ? Link2
        : asset.asset_type === "text"
          ? FileText
          : Paperclip;
  return (
    <article className="flex flex-col overflow-hidden rounded-xl border bg-card shadow-sm">
      {isPicture ? (
        <a href={asset.url ?? undefined} target="_blank" rel="noreferrer">
          <img
            src={asset.url ?? undefined}
            alt={asset.title}
            loading="lazy"
            className="aspect-square w-full object-cover"
          />
        </a>
      ) : (
        <div className="flex aspect-[4/3] w-full items-center justify-center bg-muted/50">
          <Icon className="h-8 w-8 text-muted-foreground" />
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 p-3">
        <div className="flex items-start gap-2">
          <h3 className="min-w-0 flex-1 truncate text-sm font-medium">
            {asset.title || hostLabel(asset.url ?? "")}
          </h3>
          {asset.source === "client" ? (
            <span className="shrink-0 rounded-full bg-teal-500/10 px-2 py-0.5 text-[10px] font-medium text-teal-700 dark:text-teal-300">
              מהלקוח
            </span>
          ) : null}
        </div>
        {asset.text ? (
          <p className="line-clamp-4 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
            {asset.text}
          </p>
        ) : null}
        {asset.asset_type === "site" ? (
          <p className="text-xs text-muted-foreground">
            {inspected
              ? "כרמן קראה את האתר"
              : "כרמן עוד לא קראה את האתר. בקשי ממנה להסתכל עליו."}
          </p>
        ) : null}
        {colors.length > 0 ? (
          <div className="flex gap-1" aria-label="צבעי מותג">
            {colors.map((color) => (
              <span
                key={color}
                title={color}
                className="h-4 w-4 rounded-full border"
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        ) : null}
        <div className="mt-auto flex items-center gap-1 pt-1">
          {canBeReference(asset) ? (
            <Button
              type="button"
              size="sm"
              variant={asset.use_as_reference ? "default" : "outline"}
              className="h-7 gap-1 px-2 text-xs"
              disabled={!asset.use_as_reference && referencesFull}
              title={
                !asset.use_as_reference && referencesFull
                  ? `אפשר עד ${MAX_USER_REFERENCES} רפרנסים בפרויקט`
                  : "כרמן תיצור לפי הסגנון של התמונה הזו"
              }
              onClick={() => onToggleReference(asset)}
            >
              <Star className="h-3 w-3" />
              {asset.use_as_reference ? "רפרנס" : "השתמשי כרפרנס"}
            </Button>
          ) : null}
          {asset.url && asset.asset_type !== "image" ? (
            <Button
              asChild
              size="sm"
              variant="ghost"
              className="h-7 gap-1 px-2 text-xs"
            >
              <a href={asset.url} target="_blank" rel="noreferrer">
                <ExternalLink className="h-3 w-3" />
                פתחי
              </a>
            </Button>
          ) : null}
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="ms-auto h-7 w-7 text-muted-foreground hover:text-destructive"
            aria-label="הסרת נכס"
            onClick={() => onDelete(asset)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </article>
  );
}
