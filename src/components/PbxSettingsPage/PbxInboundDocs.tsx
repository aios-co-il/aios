import { Label } from "@/components/ui/label";
import { Code, CodeBlock } from "./Code";
import { buildInboundExamples, INBOUND_FIELDS } from "./examples";

function FieldsTable() {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border rounded-md">
        <thead className="bg-muted/50">
          <tr>
            <th className="p-2 text-right">שדה</th>
            <th className="p-2 text-right">שמות חלופיים</th>
            <th className="p-2 text-right">תיאור</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {INBOUND_FIELDS.map(([field, aliases, description]) => (
            <tr key={field}>
              <td className="p-2">
                <Code>{field}</Code>
              </td>
              <td className="p-2 text-xs">
                <Code>{aliases}</Code>
              </td>
              <td className="p-2">{description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Example({ title, code }: { title: string; code: string }) {
  return (
    <div className="space-y-2">
      <Label className="text-sm font-semibold">{title}</Label>
      <CodeBlock code={code} />
    </div>
  );
}

/** How the PBX should call the incoming webhook. */
export function PbxInboundDocs({
  url,
  secret,
}: {
  url: string;
  secret: string;
}) {
  const examples = buildInboundExamples(url, secret);
  return (
    <div className="space-y-3">
      <h3 className="font-semibold">דוקומנטציה</h3>
      <p className="text-sm text-muted-foreground">
        שיטה: <Code>POST</Code> (או <Code>GET</Code> עם פרמטרים ב-URL). פורמטים
        נתמכים: <Code>application/json</Code>,{" "}
        <Code>application/x-www-form-urlencoded</Code>,{" "}
        <Code>multipart/form-data</Code> (להעלאת קובץ הקלטה).
      </p>
      <FieldsTable />

      <div className="space-y-1 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">איך ההקלטה משויכת לליד:</p>
        <ol className="list-decimal list-inside space-y-1">
          <li>
            אם נשלח <Code>call_id</Code> של שיחה קיימת — ההקלטה מתווספת לשיחה
            ולליד שלה.
          </li>
          <li>
            אחרת המערכת מחפשת ליד (ואז לקוח) שהטלפון שלו תואם ל-9 הספרות
            האחרונות של מספר המתקשר.
          </li>
          <li>אם אין ליד תואם, השיחה נשמרת ללא שיוך.</li>
        </ol>
        <p>ההקלטה מופיעה בלשונית "שיחות" בכרטיס הליד.</p>
      </div>

      <Example title="דוגמה: קישור להקלטה (JSON)" code={examples.json} />
      <Example title="דוגמה: העלאת קובץ הקלטה" code={examples.file} />
      <Example title="תשובה" code={examples.response} />
      <p className="text-xs text-muted-foreground">
        קודי שגיאה: <Code>400</Code> בקשה שגויה, <Code>403</Code> סוד שגוי,{" "}
        <Code>404</Code> מרכזיה לא מוגדרת או מושבתת, <Code>413</Code> קובץ גדול
        מדי, <Code>415</Code> קובץ שאינו אודיו.
      </p>
    </div>
  );
}
