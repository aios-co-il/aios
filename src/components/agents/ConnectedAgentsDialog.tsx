import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConnectedAgentProfiles } from "@/components/agents/ConnectedAgentProfiles";

export function ConnectedAgentsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-3xl max-h-[90vh] overflow-y-auto"
        dir="rtl"
      >
        <DialogHeader>
          <DialogTitle className="text-right">
            פרופילי סוכנים מחוברים
          </DialogTitle>
        </DialogHeader>
        <ConnectedAgentProfiles />
      </DialogContent>
    </Dialog>
  );
}
