import { useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  PROJECT_KINDS,
  type ProjectActions,
  type ProjectKind,
} from "./useWorkshopProjectActions";

/** The list's "new" button: a project opened by name and type, or described to Carmen. */
export function NewProjectDialog({ actions }: { actions: ProjectActions }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<ProjectKind>("video");
  const [saving, setSaving] = useState(false);

  /** Opens the dialog with an empty form. */
  function start() {
    setTitle("");
    setKind("video");
    setOpen(true);
  }

  /** Creates the project and closes; a refusal keeps the form for another try. */
  async function submit() {
    setSaving(true);
    try {
      await actions.create(title.trim(), kind);
      setOpen(false);
    } catch {
      // The action already told the user why.
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={start}
        className="inline-flex h-7 items-center gap-1 rounded-md border border-[rgb(136_193_255/40%)] px-2 text-sm text-sky-100 hover:bg-white/10"
      >
        <Plus className="h-3.5 w-3.5" />
        חדש
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir="rtl" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>פרויקט חדש</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="new-project-title">שם הפרויקט</Label>
              <Input
                id="new-project-title"
                value={title}
                maxLength={200}
                autoFocus
                onChange={(event) => setTitle(event.target.value)}
              />
            </div>
            <fieldset className="space-y-1.5">
              <legend className="text-sm font-medium">סוג</legend>
              <div className="flex flex-wrap gap-2">
                {PROJECT_KINDS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={kind === option.value}
                    onClick={() => setKind(option.value)}
                    className={cn(
                      "rounded-md border px-3 py-1.5 text-sm",
                      kind === option.value
                        ? "border-primary bg-primary text-primary-foreground"
                        : "hover:bg-muted",
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </fieldset>
            <DialogFooter className="flex-row items-center justify-between gap-2 sm:justify-between">
              <Button
                type="button"
                variant="link"
                className="px-0"
                onClick={() => {
                  setOpen(false);
                  actions.askCarmen();
                }}
              >
                או לתאר לכרמן בצ׳אט
              </Button>
              <Button type="submit" disabled={!title.trim() || saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                פתיחת פרויקט
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
