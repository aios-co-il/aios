import { useState } from "react";
import { Loader2, MoreVertical } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import type { ProjectActions } from "./useWorkshopProjectActions";

/** A project row's menu: rename it, or delete it from the list (archived, its files kept). */
export function ProjectRowMenu({
  itemId,
  title,
  actions,
}: {
  itemId: string;
  title: string;
  actions: Pick<ProjectActions, "rename" | "archive">;
}) {
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [name, setName] = useState(title);
  const [saving, setSaving] = useState(false);

  /** Runs one action; the dialog closes when it is saved and stays open after a refusal. */
  async function run(work: () => Promise<void>, close: () => void) {
    setSaving(true);
    try {
      await work();
      close();
    } catch {
      // The action already told the user why.
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <DropdownMenu dir="rtl">
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`פעולות על ${title}`}
            className="shrink-0 rounded p-1 text-slate-400 hover:bg-white/10 hover:text-slate-100"
          >
            <MoreVertical className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onSelect={() => {
              setName(title);
              setRenaming(true);
            }}
          >
            שינוי שם
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onSelect={() => setDeleting(true)}
          >
            מחיקה
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={renaming} onOpenChange={setRenaming}>
        <DialogContent dir="rtl" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>שינוי שם הפרויקט</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void run(
                () => actions.rename(itemId, name.trim()),
                () => setRenaming(false),
              );
            }}
          >
            <Input
              aria-label="שם הפרויקט"
              value={name}
              maxLength={200}
              autoFocus
              onChange={(event) => setName(event.target.value)}
            />
            <DialogFooter>
              <Button type="submit" disabled={!name.trim() || saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                שמירה
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleting} onOpenChange={setDeleting}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>למחוק את "{title}"?</AlertDialogTitle>
            <AlertDialogDescription>
              הפרויקט יוסר מהרשימה. הסצנות, הנכסים והקבצים שלו נשמרים.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction
              disabled={saving}
              onClick={(event) => {
                event.preventDefault();
                void run(
                  () => actions.archive(itemId),
                  () => setDeleting(false),
                );
              }}
            >
              מחיקה
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
