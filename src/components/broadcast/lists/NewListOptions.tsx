import { Filter, Upload } from "lucide-react";

export type NewListType = "manual" | "crm";
/** synced = static members kept up to date by the database (and, for leads, an editable automation). */
export type NewListKind = "synced" | "dynamic" | "static";

/** File/manual list vs. a list built from a CRM filter. */
export function NewListTypePicker({
  value,
  onChange,
}: {
  value: NewListType;
  onChange: (t: NewListType) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <button
        type="button"
        onClick={() => onChange("manual")}
        className={`rounded-lg border p-3 text-right text-sm ${value === "manual" ? "border-primary bg-primary/5" : ""}`}
      >
        <Upload className="mb-1 h-4 w-4" />
        <div className="font-medium">מקובץ / ידני</div>
        <div className="text-xs text-muted-foreground">
          Excel, CSV, Google Sheets או הוספה ידנית
        </div>
      </button>
      <button
        type="button"
        onClick={() => onChange("crm")}
        className={`rounded-lg border p-3 text-right text-sm ${value === "crm" ? "border-primary bg-primary/5" : ""}`}
      >
        <Filter className="mb-1 h-4 w-4" />
        <div className="font-medium">לפי סינון CRM</div>
        <div className="text-xs text-muted-foreground">
          סטטוס, שלב במשפך, סוכנות, קמפיינר
        </div>
      </button>
    </div>
  );
}

/** How a CRM-filter list keeps (or does not keep) its members up to date. */
export function NewListKindOptions({
  value,
  onChange,
  leads,
}: {
  value: NewListKind;
  onChange: (k: NewListKind) => void;
  /** Lead lists also get an editable sync automation. */
  leads: boolean;
}) {
  return (
    <div className="space-y-2 rounded-lg border p-3">
      <label className="flex items-start gap-2 text-sm">
        <input
          type="radio"
          checked={value === "synced"}
          onChange={() => onChange("synced")}
          className="mt-1"
        />
        <span>
          <span className="font-medium">מסונכרנת (מומלץ)</span> – מי שמתחיל
          לעמוד בסינון נכנס לרשימה ומי שמפסיק יוצא ממנה, בכל שינוי: שלב, סטטוס,
          סוכנות, איש מכירות, קמפיינר או תגית.
          {leads && " נוצרת גם אוטומציה שאפשר לערוך ולכבות."}
        </span>
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="radio"
          checked={value === "dynamic"}
          onChange={() => onChange("dynamic")}
          className="mt-1"
        />
        <span>
          <span className="font-medium">דינמית</span> – מתעדכנת לבד: בכל שליחה
          נשלח למי שעונה לסינון באותו רגע.
        </span>
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="radio"
          checked={value === "static"}
          onChange={() => onChange("static")}
          className="mt-1"
        />
        <span>
          <span className="font-medium">קבועה</span> – צילום מצב עכשיו. אפשר
          להוסיף/להסיר דרך אוטומציה או ידנית.
        </span>
      </label>
    </div>
  );
}
