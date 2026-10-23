import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  small?: boolean;
  className?: string;
}

/** A labelled left-to-right input, used for URLs, numbers and field names. */
export function LtrField({
  label,
  value,
  onChange,
  placeholder,
  type,
  small,
  className,
}: Props) {
  return (
    <div className={`${small ? "space-y-1" : "space-y-2"} ${className ?? ""}`}>
      <Label className={small ? "text-xs text-muted-foreground" : undefined}>
        {label}
      </Label>
      <Input
        dir="ltr"
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}
