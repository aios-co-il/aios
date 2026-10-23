import DOMPurify from "dompurify";

/** Read-only preview of template HTML content in the broadcast wizard. */
export function WizardContentPreview({
  bodyHtml,
  htmlMode,
}: {
  bodyHtml: string;
  htmlMode: boolean;
}) {
  return (
    <div className="space-y-2">
      {htmlMode ? (
        <iframe
          title="תצוגה מקדימה"
          sandbox=""
          srcDoc={bodyHtml}
          className="h-72 w-full rounded-md border bg-white"
        />
      ) : (
        <div
          className="max-h-72 overflow-y-auto rounded-md border bg-white p-3 text-black"
          dir="rtl"
          dangerouslySetInnerHTML={{
            __html: DOMPurify.sanitize(bodyHtml),
          }}
        />
      )}
      <p className="text-xs text-muted-foreground">
        התוכן מגיע מהטמפלייט; שדות דינמיים יוחלפו לכל נמען. לעריכה – טמפלייטים.
      </p>
    </div>
  );
}
