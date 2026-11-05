import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { editArgs, type PageDraft } from "./pageEdit";
import type { WorkshopArtifact } from "./workshopFeedModel";

/**
 * Saves the user's own edit of a concept or script page (workshop_edit_page). An edited script
 * becomes the project's script and waits for the user's approval again.
 */
export function useEditPage(
  tenantId: string | undefined,
  projectId: string | null,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      artifact,
      draft,
    }: {
      artifact: WorkshopArtifact;
      draft: PageDraft;
    }) => {
      const { error } = await supabase.rpc(
        "workshop_edit_page",
        editArgs(artifact, draft),
      );
      if (error) {
        throw error;
      }
    },
    onSuccess: (_data, { artifact }) =>
      toast.success(
        artifact.kind === "script"
          ? "התסריט נשמר. הוא ממתין לאישור שלך"
          : "הקונספט נשמר",
      ),
    onError: (error) => {
      console.error("[workshop] page edit failed", error);
      toast.error(
        /storyboard is already written/.test(error.message)
          ? "הסטוריבורד כבר נכתב מהתסריט: עורכים עכשיו את הסצנות בלוח הסצנות"
          : "לא הצלחנו לשמור את העמוד",
      );
    },
    onSettled: () =>
      queryClient.invalidateQueries({
        queryKey: ["workshop-artifacts", tenantId, projectId],
      }),
  });
}
