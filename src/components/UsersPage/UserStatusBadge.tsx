import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const STATUS_LABELS: Record<string, string> = {
  active: "פעיל",
  pending: "ממתין",
  inactive: "לא פעיל",
};

const STATUS_CLASSES: Record<string, string> = {
  active: "bg-green-500",
  pending: "bg-yellow-500",
};

/** Membership status of one user: active, pending invite, or inactive. */
export function UserStatusBadge({
  status,
  className,
}: {
  status: string | null;
  className?: string;
}) {
  if (!status) {
    return null;
  }

  return (
    <Badge
      variant={statusVariant(status)}
      className={cn(STATUS_CLASSES[status], className)}
    >
      {STATUS_LABELS[status] ?? status}
    </Badge>
  );
}

/** Active reads as primary, a pending invite as secondary, anything else as outline. */
function statusVariant(status: string) {
  if (status === "active") {
    return "default";
  }
  if (status === "pending") {
    return "secondary";
  }
  return "outline";
}
