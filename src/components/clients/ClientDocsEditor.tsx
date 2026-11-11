import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  FolderLinksField,
  type FolderLink,
} from "@/components/forms/FolderLinksField";
import {
  AttachmentsField,
  type Attachment,
} from "@/components/forms/AttachmentsField";
import type { Tables } from "@/integrations/supabase/types";
import { ClientLinkedFiles } from "@/components/clients/ClientLinkedFiles";
import { useFolderLinksAndAttachments } from "@/hooks/useFolderLinksAndAttachments";
import { FileText, Copy, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isAdAccountLink } from "@/lib/adAccountUrl";
import { useClientAdLinks } from "@/hooks/useClientAdLinks";

interface ClientDocsEditorProps {
  client: Pick<
    Tables<"clients">,
    | "id"
    | "meta_ads_account_id"
    | "google_ads_account_id"
    | "folder_links"
    | "attachments"
  >;
  tenantId: string;
}

export function ClientDocsEditor({ client, tenantId }: ClientDocsEditorProps) {
  const queryClient = useQueryClient();
  const { folderLinks, setFolderLinks, attachments, setAttachments } =
    useFolderLinksAndAttachments(client);

  const handleFolderLinksChange = async (newLinks: FolderLink[]) => {
    setFolderLinks(newLinks);
    const { error } = await supabase
      .from("clients")
      .update({ folder_links: newLinks })
      .eq("id", client.id);
    if (error) {
      toast.error("שגיאה בעדכון קישורים");
    } else {
      queryClient.invalidateQueries({ queryKey: ["clients", tenantId] });
    }
  };

  const handleAttachmentsChange = async (newAttachments: Attachment[]) => {
    setAttachments(newAttachments);
    const { error } = await supabase
      .from("clients")
      .update({ attachments: newAttachments })
      .eq("id", client.id);
    if (error) {
      toast.error("שגיאה בעדכון קבצים");
    } else {
      queryClient.invalidateQueries({ queryKey: ["clients", tenantId] });
    }
  };

  const copyToClipboard = (text: string | null, label: string) => {
    navigator.clipboard.writeText(text ?? "");
    toast.success(`${label} הועתק`);
  };

  // The clients list does not carry the saved links, so they load here.
  const { links } = useClientAdLinks(client.id);
  const metaUrl = isAdAccountLink("meta_ads_url", links?.meta_ads_url)
    ? links?.meta_ads_url
    : null;
  const googleUrl = isAdAccountLink("google_ads_url", links?.google_ads_url)
    ? links?.google_ads_url
    : null;
  const hasAdAccounts =
    client.meta_ads_account_id ||
    client.google_ads_account_id ||
    metaUrl ||
    googleUrl;

  return (
    <div className="space-y-6">
      {hasAdAccounts && (
        <div className="space-y-2">
          <h3 className="font-semibold text-sm flex items-center gap-2 justify-end">
            חשבונות פרסום
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {(client.meta_ads_account_id || metaUrl) && (
              <div
                className="flex items-center gap-2 p-2.5 rounded-lg border bg-card text-sm"
                dir="rtl"
              >
                <span className="text-muted-foreground text-xs whitespace-nowrap">
                  Meta Ads:
                </span>
                <span className="font-mono truncate flex-1">
                  {client.meta_ads_account_id || "קישור ישיר"}
                </span>
                {client.meta_ads_account_id && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0"
                    onClick={() =>
                      copyToClipboard(
                        client.meta_ads_account_id,
                        "מזהה Meta Ads",
                      )
                    }
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                )}
                {metaUrl && (
                  <Button
                    asChild
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0"
                  >
                    <a
                      href={metaUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="פתיחת החשבון"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </Button>
                )}
              </div>
            )}
            {(client.google_ads_account_id || googleUrl) && (
              <div
                className="flex items-center gap-2 p-2.5 rounded-lg border bg-card text-sm"
                dir="rtl"
              >
                <span className="text-muted-foreground text-xs whitespace-nowrap">
                  Google Ads:
                </span>
                <span className="font-mono truncate flex-1">
                  {client.google_ads_account_id || "קישור ישיר"}
                </span>
                {client.google_ads_account_id && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0"
                    onClick={() =>
                      copyToClipboard(
                        client.google_ads_account_id,
                        "מזהה Google Ads",
                      )
                    }
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                )}
                {googleUrl && (
                  <Button
                    asChild
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0"
                  >
                    <a
                      href={googleUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="פתיחת החשבון"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
      <FolderLinksField
        links={folderLinks}
        onChange={handleFolderLinksChange}
      />
      <AttachmentsField
        attachments={attachments}
        onChange={handleAttachmentsChange}
        entityType="client"
        entityId={client.id}
      />
      <div className="space-y-2">
        <h3 className="font-semibold text-sm flex items-center gap-2 justify-end">
          קבצים משויכים מצ׳אט
          <FileText className="h-4 w-4 text-primary" />
        </h3>
        <ClientLinkedFiles clientId={client.id} tenantId={tenantId} />
      </div>
    </div>
  );
}
