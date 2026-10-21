import { STANDARD_TEMPLATE_FIELDS } from "../../../supabase/functions/_shared/broadcast-template.ts";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Braces } from "lucide-react";

/** "{{field}}" insert menu: standard fields plus custom columns of a list. */
export function TemplateFieldPicker({
  onPick,
  customKeys = [],
  size = "sm",
}: {
  onPick: (token: string) => void;
  customKeys?: string[];
  size?: "sm" | "default";
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size={size}>
          <Braces className="ml-1 h-4 w-4" />
          שדה דינמי
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="max-h-80 overflow-y-auto z-[100]"
      >
        <DropdownMenuLabel>שדות אנשי קשר</DropdownMenuLabel>
        {STANDARD_TEMPLATE_FIELDS.map((f) => (
          <DropdownMenuItem key={f.key} onSelect={() => onPick(`{{${f.key}}}`)}>
            <span className="flex-1">{f.label}</span>
            <code className="text-xs text-muted-foreground" dir="ltr">
              {f.key}
            </code>
          </DropdownMenuItem>
        ))}
        {customKeys.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>עמודות מהרשימה</DropdownMenuLabel>
            {customKeys.map((k) => (
              <DropdownMenuItem key={k} onSelect={() => onPick(`{{${k}}}`)}>
                <code className="text-xs">{k}</code>
              </DropdownMenuItem>
            ))}
          </>
        )}
        <DropdownMenuSeparator />
        <div className="px-2 py-1 text-xs text-muted-foreground">
          ערך ברירת מחדל: <code dir="ltr">{"{{first_name|חבר/ה}}"}</code>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
