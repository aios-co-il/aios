import { useState } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import {
  useBroadcastLists,
  type NewMemberRow,
} from "@/hooks/useBroadcastLists";
import { fieldKeyFromHeader } from "../../../supabase/functions/_shared/broadcast/template/template-vars.ts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { errorMessage } from "@/components/broadcast/templateUtils";
import { toast } from "sonner";
import { FileUp, Loader2 } from "lucide-react";

type Target = "name" | "phone" | "email" | "custom" | "ignore";

const guess = (h: string): Target => {
  const s = h.trim().toLowerCase();
  if (/(phone|mobile|טלפון|נייד|פלאפון|וואטסאפ|whatsapp)/.test(s))
    return "phone";
  if (/(mail|אימייל|מייל|דוא)/.test(s)) return "email";
  if (/^(name|full name|שם|שם מלא|איש קשר|contact)$/.test(s)) return "name";
  return "custom";
};

async function parseFile(
  file: File,
): Promise<{ headers: string[]; rows: string[][] }> {
  const ext = file.name.split(".").pop()?.toLowerCase();
  let matrix: string[][];
  if (ext === "xlsx" || ext === "xls") {
    const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    matrix = XLSX.utils.sheet_to_json<string[]>(sheet, {
      header: 1,
      raw: false,
      defval: "",
    });
  } else {
    const text = await file.text();
    matrix = Papa.parse<string[]>(text, { skipEmptyLines: true }).data;
  }
  const [headerRow = [], ...rows] = matrix;
  return {
    headers: headerRow.map(
      (h, i) => String(h || "").trim() || `עמודה ${i + 1}`,
    ),
    rows: rows.map((r) => r.map((c) => String(c ?? "").trim())),
  };
}

/** Upload a CSV / Excel file into a static list. Extra columns become {{fields}}. */
export function ListFileImport({ listId }: { listId: string }) {
  const { addMembers } = useBroadcastLists();
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[] | null>(null);
  const [rows, setRows] = useState<string[][]>([]);
  const [map, setMap] = useState<Target[]>([]);

  const onFile = async (file?: File) => {
    if (!file) return;
    try {
      const parsed = await parseFile(file);
      if (parsed.rows.length === 0) return toast.error("הקובץ ריק");
      setFileName(file.name);
      setHeaders(parsed.headers);
      setRows(parsed.rows);
      setMap(parsed.headers.map(guess));
    } catch (e: any) {
      toast.error("לא הצלחתי לקרוא את הקובץ: " + (e?.message || ""));
    }
  };

  const runImport = () => {
    if (!headers) return;
    if (!map.includes("phone") && !map.includes("email"))
      return toast.error("צריך למפות עמודת טלפון או אימייל");
    const members: NewMemberRow[] = rows.map((r) => {
      const custom: Record<string, string> = {};
      const m: NewMemberRow = { custom_fields: custom };
      map.forEach((t, i) => {
        const v = r[i];
        if (!v) return;
        if (t === "name" || t === "phone" || t === "email") m[t] = v;
        else if (t === "custom") {
          const key = fieldKeyFromHeader(headers[i]);
          if (key) custom[key] = v;
        }
      });
      return m;
    });
    addMembers.mutate(
      { listId, rows: members, via: "file" },
      {
        onSuccess: (n) => {
          toast.success(`יובאו ${n} אנשי קשר מתוך ${rows.length} שורות`);
          setHeaders(null);
          setRows([]);
          setFileName("");
        },
        onError: (e) => toast.error("הייבוא נכשל: " + errorMessage(e)),
      },
    );
  };

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <Label className="flex items-center gap-1">
        <FileUp className="h-4 w-4" />
        העלאת קובץ (Excel / CSV)
      </Label>
      <p className="text-xs text-muted-foreground">
        שורה ראשונה = כותרות. עמודות נוספות נשמרות כשדות דינמיים לטמפלייטים
        (למשל <code dir="ltr">{"{{עיר}}"}</code>).
      </p>
      <Input
        type="file"
        accept=".csv,.xlsx,.xls"
        onChange={(e) => onFile(e.target.files?.[0])}
      />
      {headers && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {fileName} · {rows.length} שורות · מיפוי עמודות:
          </p>
          {headers.map((h, i) => (
            <div key={`${h}-${i}`} className="flex items-center gap-2 text-sm">
              <span className="w-40 truncate" title={h}>
                {h}
              </span>
              <Select
                value={map[i]}
                onValueChange={(v) =>
                  setMap(map.map((x, j) => (j === i ? (v as Target) : x)))
                }
              >
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="z-[100] bg-background">
                  <SelectItem value="name">שם</SelectItem>
                  <SelectItem value="phone">טלפון</SelectItem>
                  <SelectItem value="email">אימייל</SelectItem>
                  <SelectItem value="custom">שדה דינמי</SelectItem>
                  <SelectItem value="ignore">— התעלם —</SelectItem>
                </SelectContent>
              </Select>
              <span className="truncate text-xs text-muted-foreground">
                {rows[0]?.[i]}
              </span>
            </div>
          ))}
          <Button onClick={runImport} disabled={addMembers.isPending}>
            {addMembers.isPending && (
              <Loader2 className="ml-1 h-4 w-4 animate-spin" />
            )}
            ייבא {rows.length} שורות
          </Button>
        </div>
      )}
    </div>
  );
}
