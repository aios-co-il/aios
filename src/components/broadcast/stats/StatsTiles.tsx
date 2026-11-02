import {
  countRecipients,
  percent,
  type RecipientTimes,
} from "./broadcastStats";

/** Count tiles with rates; email adds delivered / opened / clicked. */
export function StatsTiles({
  rows,
  isEmail,
}: {
  rows: RecipientTimes[];
  isEmail: boolean;
}) {
  const c = countRecipients(rows);
  const tiles = [
    { label: "נמענים", value: c.total, sub: "" },
    { label: "נשלחו", value: c.sent, sub: percent(c.sent, c.total) },
    ...(isEmail
      ? [
          {
            label: "נמסרו",
            value: c.delivered,
            sub: percent(c.delivered, c.sent),
          },
          {
            label: "נפתחו",
            value: c.opened,
            sub: percent(c.opened, c.rateBase),
          },
          {
            label: "הקליקו",
            value: c.clicked,
            sub: percent(c.clicked, c.rateBase),
          },
        ]
      : []),
    { label: "נכשלו", value: c.failed, sub: percent(c.failed, c.total) },
  ];

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-6">
      {tiles.map((t) => (
        <div key={t.label} className="rounded-lg border p-3">
          <div className="text-xs text-muted-foreground">{t.label}</div>
          <div className="text-xl font-semibold tabular-nums">{t.value}</div>
          {t.sub && (
            <div className="text-xs tabular-nums text-muted-foreground">
              {t.sub}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
