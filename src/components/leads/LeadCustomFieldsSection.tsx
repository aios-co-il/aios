import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type {
  LeadCustomFieldDefinition,
  LeadCustomFieldValue,
  LeadCustomFieldValues,
} from "@/lib/leadCustomFields";

interface LeadCustomFieldsSectionProps {
  fields: LeadCustomFieldDefinition[];
  values: LeadCustomFieldValues;
  onChange: (fieldKey: string, value: LeadCustomFieldValue) => void;
}

function getOptions(options: unknown): Array<{ label: string; value: string }> {
  if (!Array.isArray(options)) return [];

  return options.flatMap((option) => {
    if (typeof option === "string") return [{ label: option, value: option }];
    if (!option || typeof option !== "object") return [];
    const item = option as Record<string, unknown>;
    const value = String(item.value ?? item.label ?? "").trim();
    if (!value) return [];
    return [{ value, label: String(item.label ?? value) }];
  });
}

export function LeadCustomFieldsSection({
  fields,
  values,
  onChange,
}: LeadCustomFieldsSectionProps) {
  if (fields.length === 0) return null;

  return (
    <div className="space-y-3 rounded-xl border border-border/60 bg-muted/20 p-4" dir="rtl">
      <h3 className="text-sm font-semibold">שדות מותאמים אישית</h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {fields.map((field) => {
          const id = `lead-custom-field-${field.id}`;
          const value = values[field.field_key];
          const label = (
            <Label htmlFor={id} className="text-sm font-medium">
              {field.field_label}
              {field.is_required ? " *" : ""}
            </Label>
          );

          if (field.field_type === "checkbox") {
            return (
              <div key={field.id} className="flex min-h-11 items-center gap-2">
                <Checkbox
                  id={id}
                  checked={value === true}
                  onCheckedChange={(checked) => onChange(field.field_key, checked === true)}
                />
                {label}
              </div>
            );
          }

          if (field.field_type === "textarea") {
            return (
              <div key={field.id} className="space-y-2 sm:col-span-2">
                {label}
                <Textarea
                  id={id}
                  value={String(value ?? "")}
                  onChange={(event) => onChange(field.field_key, event.target.value)}
                  rows={3}
                  required={field.is_required}
                  className="text-right"
                  dir="rtl"
                />
              </div>
            );
          }

          if (field.field_type === "select") {
            const options = getOptions(field.options);
            return (
              <div key={field.id} className="space-y-2">
                {label}
                {options.length > 0 ? (
                  <Select
                    value={String(value ?? "")}
                    onValueChange={(nextValue) => onChange(field.field_key, nextValue)}
                  >
                    <SelectTrigger id={id} className="text-right">
                      <SelectValue placeholder="בחר אפשרות" />
                    </SelectTrigger>
                    <SelectContent>
                      {options.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    id={id}
                    value={String(value ?? "")}
                    onChange={(event) => onChange(field.field_key, event.target.value)}
                    required={field.is_required}
                    className="text-right"
                    dir="rtl"
                  />
                )}
              </div>
            );
          }

          const inputType =
            field.field_type === "number"
              ? "number"
              : field.field_type === "date"
                ? "date"
                : field.field_type === "email"
                  ? "email"
                  : field.field_type === "phone"
                    ? "tel"
                    : "text";

          return (
            <div key={field.id} className="space-y-2">
              {label}
              <Input
                id={id}
                type={inputType}
                value={String(value ?? "")}
                onChange={(event) => onChange(field.field_key, event.target.value)}
                required={field.is_required}
                className="text-right"
                dir={inputType === "email" ? "ltr" : "rtl"}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
