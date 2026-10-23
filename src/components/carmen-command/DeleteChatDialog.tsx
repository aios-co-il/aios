import { topicTitle, type TopicChat } from "@/lib/chatTopics";
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

interface DeleteChatDialogProps {
  chat: TopicChat | null;
  onCancel: () => void;
  onConfirm: (chat: TopicChat) => void;
}

export function DeleteChatDialog({
  chat,
  onCancel,
  onConfirm,
}: DeleteChatDialogProps) {
  return (
    <AlertDialog open={!!chat} onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogContent dir="rtl" className="z-[100] text-right">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-right">
            למחוק את השיחה?
          </AlertDialogTitle>
          <AlertDialogDescription className="text-right">
            "{topicTitle(chat?.title)}" תימחק לצמיתות, עם כל ההודעות שבה.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2">
          <AlertDialogCancel>ביטול</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => {
              const conv = chat;
              onCancel();
              if (conv) onConfirm(conv);
            }}
          >
            מחיקה
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
