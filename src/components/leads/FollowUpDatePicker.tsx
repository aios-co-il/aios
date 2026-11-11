import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { CalendarClock, X } from "lucide-react";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useCurrentTenant } from "@/hooks/useCurrentTenant";
import { followUpDue } from "./followUpDue";

interface FollowUpDatePickerProps {
  leadId: string;
  currentDate: string | null;
  variant?: "icon" | "full";
  onSuccess?: () => void;
  onOptimisticUpdate?: (leadId: string, newDate: string | null) => void;
}

export function FollowUpDatePicker({
  leadId,
  currentDate,
  variant = "icon",
  onSuccess,
  onOptimisticUpdate,
}: FollowUpDatePickerProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { tenantId } = useCurrentTenant();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(
    currentDate ? new Date(currentDate) : undefined,
  );

  const { isOverdue, isToday, daysLate } = followUpDue(currentDate);

  const updateFollowUpDate = useMutation({
    mutationFn: async (date: Date | null) => {
      let dateString: string | null = null;
      if (date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        dateString = `${year}-${month}-${day}`;
      }

      const { error } = await supabase
        .from("leads")
        .update({ follow_up_date: dateString })
        .eq("id", leadId);

      if (error) throw error;
    },
    onSuccess: (_data, dateArg) => {
      let dateString: string | null = null;
      if (dateArg) {
        const year = dateArg.getFullYear();
        const month = String(dateArg.getMonth() + 1).padStart(2, "0");
        const day = String(dateArg.getDate()).padStart(2, "0");
        dateString = `${year}-${month}-${day}`;
      }

      if (onOptimisticUpdate) {
        onOptimisticUpdate(leadId, dateString);
        const updateLeadInCache = (old: any) => {
          if (!old) return old;
          if (Array.isArray(old)) {
            return old.map((l: any) =>
              l.id === leadId ? { ...l, follow_up_date: dateString } : l,
            );
          }
          if (typeof old === "object") {
            const updated = { ...old };
            for (const key of Object.keys(updated)) {
              if (Array.isArray(updated[key])) {
                updated[key] = updated[key].map((l: any) =>
                  l.id === leadId ? { ...l, follow_up_date: dateString } : l,
                );
              } else if (updated[key]?.leads) {
                updated[key] = {
                  ...updated[key],
                  leads: updated[key].leads.map((l: any) =>
                    l.id === leadId ? { ...l, follow_up_date: dateString } : l,
                  ),
                };
              }
            }
            return updated;
          }
          return old;
        };
        queryClient.setQueriesData(
          { queryKey: ["leads-kanban"] },
          updateLeadInCache,
        );
        queryClient.setQueriesData(
          { queryKey: ["leads-table"] },
          updateLeadInCache,
        );
      } else {
        queryClient.invalidateQueries({ queryKey: ["leads-kanban", tenantId] });
        queryClient.invalidateQueries({ queryKey: ["leads-table", tenantId] });
        queryClient.invalidateQueries({ queryKey: ["leads-count", tenantId] });
      }

      toast({
        title: selectedDate ? "תאריך לחזרה נשמר" : "תאריך לחזרה נמחק",
      });
      setDialogOpen(false);
      onSuccess?.();
    },
    onError: (error: any) => {
      toast({
        title: "שגיאה בעדכון תאריך לחזרה",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSave = () => {
    updateFollowUpDate.mutate(selectedDate || null);
  };

  const handleClear = () => {
    setSelectedDate(undefined);
    updateFollowUpDate.mutate(null);
  };

  if (variant === "full") {
    return (
      <div className="flex items-center gap-2">
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                "justify-start text-right font-normal",
                !currentDate && "text-muted-foreground",
                isToday && "border-primary bg-primary/10",
                isOverdue &&
                  "border-destructive bg-destructive/10 text-destructive",
              )}
            >
              <CalendarClock className="ml-2 h-4 w-4" />
              {currentDate
                ? isOverdue
                  ? `${format(new Date(), "dd/MM/yyyy", { locale: he })} (איחור ${daysLate} ${daysLate === 1 ? "יום" : "ימים"})`
                  : format(new Date(currentDate), "dd/MM/yyyy", { locale: he })
                : "בחר תאריך לחזרה"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={(date) => {
                setSelectedDate(date);
                if (date) {
                  updateFollowUpDate.mutate(date);
                }
              }}
              initialFocus
              locale={he}
            />
            {currentDate && (
              <div className="p-2 border-t">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full"
                  onClick={handleClear}
                >
                  <X className="h-4 w-4 ml-2" />
                  נקה תאריך
                </Button>
              </div>
            )}
          </PopoverContent>
        </Popover>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        className={cn(
          "inline-flex h-7 max-w-full items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors",
          !currentDate &&
            "border-dashed text-muted-foreground hover:border-solid hover:bg-muted",
          currentDate &&
            !isToday &&
            !isOverdue &&
            "bg-muted/60 text-foreground hover:bg-muted",
          isToday &&
            "border-transparent bg-surface-status-yellow text-foreground",
          isOverdue &&
            "border-transparent bg-surface-status-red text-destructive",
        )}
        onClick={(e) => {
          e.stopPropagation();
          setDialogOpen(true);
        }}
        title={
          currentDate
            ? isOverdue
              ? `איחור ${daysLate} ימים`
              : `תאריך לחזרה: ${format(new Date(currentDate), "dd/MM/yyyy", { locale: he })}`
            : "הגדר תאריך לחזרה"
        }
      >
        <CalendarClock className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate tabular-nums">
          {currentDate
            ? isOverdue
              ? `${format(new Date(), "dd/MM", { locale: he })} · איחור ${daysLate} ${daysLate === 1 ? "יום" : "ימים"}`
              : isToday
                ? "היום"
                : format(new Date(currentDate), "dd/MM/yyyy", { locale: he })
            : "קבע חזרה"}
        </span>
      </button>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[350px]" dir="rtl">
          <DialogHeader>
            <DialogTitle>תאריך לחזרה</DialogTitle>
          </DialogHeader>

          <div className="py-4">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={setSelectedDate}
              initialFocus
              locale={he}
              className="rounded-md border mx-auto"
            />

            {currentDate && (
              <p
                className={cn(
                  "text-sm text-center mt-3",
                  isOverdue
                    ? "text-destructive font-medium"
                    : "text-muted-foreground",
                )}
              >
                {isOverdue
                  ? `תאריך מקורי: ${format(new Date(currentDate), "dd/MM/yyyy", { locale: he })} — איחור ${daysLate} ${daysLate === 1 ? "יום" : "ימים"}`
                  : `תאריך נוכחי: ${format(new Date(currentDate), "dd/MM/yyyy", { locale: he })}`}
              </p>
            )}
          </div>

          <DialogFooter className="gap-2">
            {currentDate && (
              <Button variant="outline" onClick={handleClear} className="gap-2">
                <X className="h-4 w-4" />
                נקה
              </Button>
            )}
            <Button
              onClick={handleSave}
              disabled={updateFollowUpDate.isPending}
            >
              {updateFollowUpDate.isPending ? "שומר..." : "שמור"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
