import { beforeEach, describe, expect, it, vi } from "vitest";

import { invokeEdgeFunction } from "@/lib/edgeFunctionInvoke";
import { startRecordingProcessing } from "./useStartRecordingProcessing";

vi.mock("@/lib/edgeFunctionInvoke", () => ({ invokeEdgeFunction: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

const invoke = vi.mocked(invokeEdgeFunction);

describe("startRecordingProcessing", () => {
  beforeEach(() => {
    invoke.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("starts the ingest pipeline for each uploaded recording", async () => {
    invoke.mockResolvedValue({ queued: true });

    const failed = await startRecordingProcessing(["rec-1", "rec-2"]);

    expect(failed).toBe(0);
    expect(invoke).toHaveBeenCalledWith("ingest-extension-recording", {
      recording_id: "rec-1",
    });
    expect(invoke).toHaveBeenCalledWith("ingest-extension-recording", {
      recording_id: "rec-2",
    });
  });

  it("counts recordings whose processing failed to start", async () => {
    invoke
      .mockResolvedValueOnce({ queued: true })
      .mockRejectedValueOnce(new Error("Recording not found"));

    const failed = await startRecordingProcessing(["rec-1", "rec-2"]);

    expect(failed).toBe(1);
  });
});
