import { Card, CardContent } from "@/components/ui/card";

const CARD = "h-full bg-gradient-to-br";
const CARD_BODY =
  "p-6 flex flex-col items-center justify-center h-full text-center";

/** One gradient KPI tile: a label, a large value and an optional note under it. */
export function KpiCard({
  tone,
  label,
  value,
  note,
}: {
  tone: string;
  label: string;
  value: string;
  note?: string | null;
}) {
  return (
    <Card className={`${CARD} ${tone}`}>
      <CardContent className={CARD_BODY}>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-3xl font-bold mt-2">{value}</p>
        {note && <p className="text-xs text-muted-foreground mt-1">{note}</p>}
      </CardContent>
    </Card>
  );
}
