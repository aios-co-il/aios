import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { withTestQuery } from "@/test/withTestQuery";
import { SummaryViewerDialog } from "./SummaryViewerDialog";
import type { ShareableRecording } from "./ShareSummaryDialog";

const openRecordingFile = vi.hoisted(() => vi.fn());
const toastError = vi.hoisted(() => vi.fn());

vi.mock("@/lib/recordingFileUrl", () => ({ openRecordingFile }));
vi.mock("sonner", () => ({ toast: { error: toastError, success: vi.fn() } }));
vi.mock("@/hooks/useRegenerateRecordingSummary", () => ({
  useRegenerateRecordingSummary: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("./ShareSummaryDialog", () => ({ ShareSummaryDialog: () => null }));

const DOCX =
  "https://x.supabase.co/storage/v1/object/public/recordings/summaries/t-1/a.docx";

function recording(summaryMd: string | null): ShareableRecording {
  return {
    id: "rec-1",
    meeting_topic: "פגישה",
    start_time: null,
    client_id: null,
    summary_md: summaryMd,
    summary_file_url: DOCX,
  };
}

function renderDialog(summaryMd: string | null) {
  render(
    withTestQuery(
      <SummaryViewerDialog
        open
        onOpenChange={() => {}}
        recording={recording(summaryMd)}
        tenantId="t-1"
      />,
    ),
  );
}

describe("SummaryViewerDialog DOCX download", () => {
  beforeEach(() => {
    openRecordingFile.mockReset();
    toastError.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("opens the stored DOCX from the header button", async () => {
    openRecordingFile.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderDialog("## תקציר");

    await user.click(screen.getByRole("button", { name: /הורד Word/ }));

    expect(openRecordingFile).toHaveBeenCalledWith(DOCX);
    expect(toastError).not.toHaveBeenCalled();
  });

  it("opens the DOCX from the link of a summary with no in-app version", async () => {
    openRecordingFile.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderDialog(null);

    await user.click(
      screen.getByRole("button", { name: "להוריד את קובץ ה-Word" }),
    );

    expect(openRecordingFile).toHaveBeenCalledWith(DOCX);
  });

  it("shows an error when signing fails, and a second click tries again", async () => {
    openRecordingFile
      .mockRejectedValueOnce(new Error("Object not found"))
      .mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    renderDialog("## תקציר");
    const button = screen.getByRole("button", { name: /הורד Word/ });

    await user.click(button);
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith("שגיאה בהורדת קובץ ה-Word"),
    );

    await user.click(button);
    expect(openRecordingFile).toHaveBeenCalledTimes(2);
    expect(toastError).toHaveBeenCalledTimes(1);
  });
});
