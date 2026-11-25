import { copyToClipboard } from "@/lib/copyToClipboard";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DnsRecord } from "../../../../supabase/functions/_shared/workshop/landing/site-domain.ts";

/** The DNS records the client adds at their domain's provider, each value copyable. */
export function LandingDnsRecords({ records }: { records: Array<DnsRecord> }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs text-muted-foreground">
        רשומות להוספה אצל ספק הדומיין:
      </p>
      <table className="w-full text-sm">
        <thead className="text-xs text-muted-foreground">
          <tr>
            <th className="p-1 text-start font-normal">סוג</th>
            <th className="p-1 text-start font-normal">שם</th>
            <th className="p-1 text-start font-normal">ערך</th>
          </tr>
        </thead>
        <tbody>
          {records.map((record) => (
            <tr key={`${record.type}-${record.name}-${record.value}`}>
              <td className="p-1 font-mono" dir="ltr">
                {record.type}
              </td>
              <td className="p-1">
                <CopyValue value={record.name} />
              </td>
              <td className="p-1">
                <CopyValue value={record.value} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A value with a button that copies it. */
function CopyValue({ value }: { value: string }) {
  /** Copies the value and says how it ended. */
  function copy() {
    void copyToClipboard(value, "הועתק");
  }
  return (
    <span className="inline-flex items-center gap-1">
      <code className="break-all font-mono" dir="ltr">
        {value}
      </code>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="h-6 w-6 shrink-0"
        aria-label={`העתקת ${value}`}
        onClick={copy}
      >
        <Copy className="h-3.5 w-3.5" />
      </Button>
    </span>
  );
}
