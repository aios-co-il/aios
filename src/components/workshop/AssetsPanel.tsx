import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ExternalLink,
  FileText,
  Globe,
  Link2,
  Loader2,
  Paperclip,
  Plus,
  Star,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  ASSET_BUCKET,
  assetTypeFor,
  hostLabel,
} from "../../../supabase/functions/_shared/workshop/assets.ts";
import { workshopAssetsKey } from "./useWorkshopAssets";
import {
  MAX_ASSET_TEXT,
  MAX_UPLOAD_BYTES,
  MAX_USER_REFERENCES,
  assetStoragePath,
  canBeReference,
  groupAssets,
  normalizeLink,
  referenceCount,
  type WorkshopAsset,
} from "./workshopAssets";

type Adding = "link" | "text" | null;

function AssetCard({
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

/** The project's inputs: files, links, briefs, references and what came with the client. */
export function AssetsPanel({
  tenantId,
  projectId,
  clientName,
  assets,
  loading,
}: {
  tenantId: string | undefined;
  projectId: string;
  clientName?: string | null;
  assets: WorkshopAsset[];
  loading: boolean;
}) {
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [adding, setAdding] = useState<Adding>(null);
  const [link, setLink] = useState("");
  const [linkTitle, setLinkTitle] = useState("");
  const [text, setText] = useState("");
  const [textTitle, setTextTitle] = useState("");

  const rows = assets;
  const sections = groupAssets(rows);
  const referencesFull = referenceCount(rows) >= MAX_USER_REFERENCES;

  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: workshopAssetsKey(tenantId, projectId),
    });

  const insert = async (row: Record<string, unknown>) => {
    const { error } = await supabase.from("workshop_assets" as never).insert({
      tenant_id: tenantId,
      item_id: projectId,
      source: "user",
      ...row,
    } as never);
    if (error) throw error;
  };

  const change = useMutation({
    mutationFn: ({ task }: { task: () => Promise<void>; failure: string }) =>
      task(),
    onSuccess: refresh,
    onError: (_error, { failure }) => toast.error(failure),
  });
  const busy = change.isPending;
  const run = (task: () => Promise<void>, failure: string) => {
    if (tenantId) change.mutate({ task, failure });
  };

  const upload = (files: FileList | null) => {
    const owner = tenantId;
    if (!files?.length || !owner) return;
    const list = Array.from(files);
    run(async () => {
      for (const file of list) {
        if (file.size > MAX_UPLOAD_BYTES) {
          toast.error(`הקובץ ${file.name} גדול מ-10MB`);
          continue;
        }
        const path = assetStoragePath(owner, projectId, file.name, Date.now());
        const { error } = await supabase.storage
          .from(ASSET_BUCKET)
          .upload(path, file);
        if (error) throw error;
        // Stored as an identifier for the server tools; the hook signs it for display.
        const { data } = supabase.storage.from(ASSET_BUCKET).getPublicUrl(path);
        const type = assetTypeFor({ name: file.name, mime: file.type });
        await insert({
          asset_type: type === "link" ? "file" : type,
          title: file.name,
          url: data.publicUrl,
          storage_path: path,
          use_as_reference: false,
          meta: { mime: file.type, size: file.size },
        });
      }
      if (input.current) input.current.value = "";
    }, "ההעלאה נכשלה");
  };

  const addLink = () => {
    const url = normalizeLink(link);
    if (!url) {
      toast.error("הקישור לא תקין");
      return;
    }
    run(async () => {
      await insert({
        asset_type: "link",
        title: linkTitle.trim() || hostLabel(url),
        url,
      });
      setLink("");
      setLinkTitle("");
      setAdding(null);
    }, "לא הצלחנו להוסיף את הקישור");
  };

  const addText = () => {
    const body = text.trim();
    if (!body) return;
    run(async () => {
      await insert({
        asset_type: "text",
        title: textTitle.trim() || "בריף",
        text: body.slice(0, MAX_ASSET_TEXT),
      });
      setText("");
      setTextTitle("");
      setAdding(null);
    }, "לא הצלחנו לשמור את הבריף");
  };

  const toggleReference = (asset: WorkshopAsset) =>
    run(async () => {
      const { error } = await supabase
        .from("workshop_assets" as never)
        .update({ use_as_reference: !asset.use_as_reference } as never)
        .eq("id", asset.id);
      if (error) throw error;
    }, "לא הצלחנו לעדכן את הרפרנס");

  const remove = (asset: WorkshopAsset) =>
    run(async () => {
      const { error } = await supabase
        .from("workshop_assets" as never)
        .delete()
        .eq("id", asset.id);
      if (error) throw error;
      if (asset.storage_path && asset.source !== "client")
        await supabase.storage.from(ASSET_BUCKET).remove([asset.storage_path]);
    }, "לא הצלחנו להסיר את הנכס");

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold">נכסים</h2>
          <p className="text-xs text-muted-foreground">
            כל מה שכרמן יכולה להשתמש בו בפרויקט: תמונות ורפרנסים, בריפים,
            קישורים
            {clientName ? `, ומה שיש אצל ${clientName}` : ""}.
          </p>
        </div>
        <input
          ref={input}
          type="file"
          multiple
          className="hidden"
          onChange={(event) => upload(event.target.files)}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 gap-1.5"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Upload className="h-3.5 w-3.5" />
          )}
          העלאת קבצים
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 gap-1.5"
          onClick={() => setAdding(adding === "link" ? null : "link")}
        >
          <Link2 className="h-3.5 w-3.5" />
          קישור
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 gap-1.5"
          onClick={() => setAdding(adding === "text" ? null : "text")}
        >
          <Plus className="h-3.5 w-3.5" />
          בריף בטקסט
        </Button>
      </div>

      {adding === "link" ? (
        <div className="flex flex-col gap-2 rounded-xl border bg-card p-3 sm:flex-row">
          <Input
            dir="ltr"
            value={link}
            placeholder="https://… אתר, מסמך בריף, דרייב"
            onChange={(event) => setLink(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && addLink()}
          />
          <Input
            value={linkTitle}
            placeholder="שם (לא חובה)"
            onChange={(event) => setLinkTitle(event.target.value)}
          />
          <Button type="button" onClick={addLink} disabled={busy}>
            הוספה
          </Button>
        </div>
      ) : null}

      {adding === "text" ? (
        <div className="flex flex-col gap-2 rounded-xl border bg-card p-3">
          <Input
            value={textTitle}
            placeholder="שם הבריף (לא חובה)"
            onChange={(event) => setTextTitle(event.target.value)}
          />
          <Textarea
            value={text}
            rows={6}
            placeholder="הדביקי כאן בריף חיצוני, הנחיות מותג או כל טקסט שכרמן צריכה להכיר"
            onChange={(event) => setText(event.target.value)}
          />
          <div className="flex justify-end">
            <Button
              type="button"
              onClick={addText}
              disabled={busy || !text.trim()}
            >
              שמירה
            </Button>
          </div>
        </div>
      ) : null}

      {loading ? (
        <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
      ) : sections.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          עוד אין נכסים. אפשר להעלות לוגו, תמונות רפרנס או בריף, ולשייך את
          הפרויקט ללקוח כדי למשוך ממנו את הבריף והאתר.
        </div>
      ) : (
        sections.map((section) => (
          <section key={section.key} className="space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground">
              {section.label} ({section.items.length})
            </h3>
            <div
              className={cn(
                "grid gap-3",
                "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4",
              )}
            >
              {section.items.map((asset) => (
                <AssetCard
                  key={asset.id}
                  asset={asset}
                  referencesFull={referencesFull}
                  onToggleReference={toggleReference}
                  onDelete={remove}
                />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
