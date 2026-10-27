import { format } from "date-fns";
import { DATA_DELETION_STATUS_LABELS } from "./dataDeletionStatus";
import { PrivacyEmailLink } from "./PrivacyEmailLink";
import { useDeletionStatus, type DeletionLookup } from "./useDeletionStatus";

function LookupResult({ result }: { result: DeletionLookup }) {
  if (result.kind === "not_found") {
    return (
      <p className="text-destructive">
        לא נמצאה בקשה עם קוד זה. אם קיבלת את הקוד מ-Facebook, פנה אלינו ל-
        <PrivacyEmailLink />.
      </p>
    );
  }
  if (result.kind === "unavailable") {
    return (
      <p className="text-destructive">
        לא הצלחנו לבדוק את הסטטוס כרגע, נסה שוב מאוחר יותר.
        <br />
        <span dir="ltr">
          We could not check the status right now, please try again later.
        </span>
      </p>
    );
  }
  return (
    <>
      <p>
        סטטוס:{" "}
        <strong>{DATA_DELETION_STATUS_LABELS[result.status.status]}</strong>
      </p>
      <p className="text-sm text-muted-foreground">
        התקבלה ב-
        {format(new Date(result.status.created_at), "dd/MM/yyyy HH:mm")}
      </p>
    </>
  );
}

export function DeletionStatusBox({ code }: { code: string }) {
  const { data, isPending } = useDeletionStatus(code);

  return (
    <div
      className="bg-muted/50 p-4 rounded-lg border"
      role="status"
      aria-live="polite"
    >
      <p className="mb-2">
        <strong>סטטוס בקשת מחיקה</strong>
      </p>
      <p className="mb-1">
        קוד אישור: <code dir="ltr">{code}</code>
      </p>
      {isPending || !data ? <p>טוען...</p> : <LookupResult result={data} />}
    </div>
  );
}
