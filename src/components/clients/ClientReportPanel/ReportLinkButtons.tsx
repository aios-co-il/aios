import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useClientAdLinks } from "@/hooks/useClientAdLinks";
import { useTenantPath } from "@/hooks/useTenantPath";
import { getAdAccountUrl } from "@/lib/adAccountUrl";
import type { ClientCardTable } from "./clientCardTable";

type Props = { table: ClientCardTable; clientId: string };

/** Opens the report's ad account and the internal report in a new tab. */
export function ReportLinkButtons({ table, clientId }: Props) {
  const { buildPath } = useTenantPath();
  const clientAdLinks = useClientAdLinks(clientId);
  const adUrl = clientAdLinks.loading
    ? null
    : getAdAccountUrl(table, clientAdLinks.links);
  return (
    <>
      {adUrl && (
        <Button
          variant="outline"
          size="sm"
          className="gap-1 text-xs"
          onClick={() => window.open(adUrl, "_blank", "noopener,noreferrer")}
        >
          <ExternalLink className="h-3 w-3" />
          פתח חשבון מודעות
        </Button>
      )}
      <Button
        variant="ghost"
        size="sm"
        className="gap-1 text-xs mr-auto"
        onClick={() => window.open(buildPath(`/table/${table.slug}`), "_blank")}
      >
        <ExternalLink className="h-3 w-3" />
        פתח דוח
      </Button>
    </>
  );
}
