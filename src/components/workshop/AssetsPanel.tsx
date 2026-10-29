import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link2, Loader2, Plus, Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert } from "@/integrations/supabase/types";
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

import { AssetCard } from "./AssetCard";

type Adding = "link" | "text" | null;
type NewAsset = Omit<
  TablesInsert<"workshop_assets">,
  "tenant_id" | "item_id" | "source"
>;

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

  const sections = groupAssets(assets);
  const referencesFull = referenceCount(assets) >= MAX_USER_REFERENCES;

  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: workshopAssetsKey(tenantId, projectId),
    });

  const insert = async (owner: string, row: NewAsset) => {
    const { error } = await supabase.from("workshop_assets").insert({
      tenant_id: owner,
      item_id: projectId,
      source: "user",
      ...row,
    });
    if (error) throw error;
  };

  const change = useMutation({
    mutationFn: ({ task }: { task: () => Promise<void>; failure: string }) =>
      task(),
    onSuccess: refresh,
    onError: (_error, { failure }) => toast.error(failure),
  });
  const busy = change.isPending;
  const run = (task: (owner: string) => Promise<void>, failure: string) => {
    if (tenantId) change.mutate({ task: () => task(tenantId), failure });
  };

  const upload = (files: FileList | null) => {
    if (!files?.length) return;
    const list = Array.from(files);
    run(async (owner) => {
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
        await insert(owner, {
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
    run(async (owner) => {
      await insert(owner, {
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
    run(async (owner) => {
      await insert(owner, {
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
        .from("workshop_assets")
        .update({ use_as_reference: !asset.use_as_reference })
        .eq("id", asset.id);
      if (error) throw error;
    }, "לא הצלחנו לעדכן את הרפרנס");

  const remove = (asset: WorkshopAsset) =>
    run(async () => {
      const { error } = await supabase
        .from("workshop_assets")
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
