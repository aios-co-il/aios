import { useState } from "react";
import { RotateCcw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface LeadFiltersFooterProps {
  isEditingPreset: boolean;
  hasActiveFilters: boolean;
  isSaving: boolean;
  isUpdating: boolean;
  onReset: () => void;
  onApply: () => void;
  onUpdatePreset: () => void;
  onSavePreset: (name: string) => void;
}

/**
 * Footer of the lead filters dialog. "Save as preset" asks for the name in place, inside the
 * same dialog, instead of stacking a second dialog on top. The name lives here so it resets
 * whenever the dialog content unmounts on close.
 */
export function LeadFiltersFooter({
  isEditingPreset,
  hasActiveFilters,
  isSaving,
  isUpdating,
  onReset,
  onApply,
  onUpdatePreset,
  onSavePreset,
}: LeadFiltersFooterProps) {
  const [naming, setNaming] = useState(false);
  const [presetName, setPresetName] = useState("");
  const trimmedName = presetName.trim();

  const cancelNaming = () => {
    setNaming(false);
    setPresetName("");
  };

  if (naming && !isEditingPreset) {
    return (
      <>
        <div className="space-y-2 border-t pt-4">
          <Label htmlFor="preset-name">שם הפריסט</Label>
          <Input
            id="preset-name"
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            placeholder="לדוגמה: לידים חמים"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter" && trimmedName && !isSaving) {
                e.preventDefault();
                onSavePreset(trimmedName);
              }
            }}
          />
        </div>
        <DialogFooter className="flex gap-2 sm:gap-2">
          <Button variant="outline" onClick={cancelNaming}>
            ביטול
          </Button>
          <Button
            onClick={() => onSavePreset(trimmedName)}
            disabled={isSaving || !trimmedName}
            className="gap-2"
          >
            <Save className="h-4 w-4" />
            {isSaving ? "שומר..." : "שמור פריסט"}
          </Button>
        </DialogFooter>
      </>
    );
  }

  return (
    <DialogFooter className="flex gap-2 sm:gap-2">
      <Button variant="outline" onClick={onReset} className="gap-2">
        <RotateCcw className="h-4 w-4" />
        איפוס
      </Button>
      {isEditingPreset ? (
        <Button
          onClick={onUpdatePreset}
          disabled={isUpdating}
          className="gap-2"
        >
          <Save className="h-4 w-4" />
          {isUpdating ? "מעדכן..." : "עדכן פריסט"}
        </Button>
      ) : (
        <>
          <Button
            variant="outline"
            onClick={() => setNaming(true)}
            disabled={!hasActiveFilters}
            className="gap-2"
          >
            <Save className="h-4 w-4" />
            שמור כפריסט
          </Button>
          <Button onClick={onApply} className="gap-2">
            החל פילטרים
          </Button>
        </>
      )}
    </DialogFooter>
  );
}
