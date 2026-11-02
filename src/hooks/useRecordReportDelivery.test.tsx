import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { withTestQuery } from "@/test/withTestQuery";
import {
  useRecordReportDelivery,
  type ReportDeliveryInput,
} from "./useRecordReportDelivery";

type FakeDb = {
  inserts: Array<{ table: string; row: Record<string, unknown> }>;
  insertError: unknown;
};

const db = vi.hoisted((): FakeDb => ({ inserts: [], insertError: null }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => ({
      insert: (row: Record<string, unknown>) => {
        db.inserts.push({ table, row });
        return Promise.resolve({ error: db.insertError });
      },
    }),
  },
}));

const reportSend: ReportDeliveryInput = {
  tenantId: "tenant-1",
  clientId: "client-1",
  targetType: "table",
  targetId: "table-1",
  title: "דוח לידים",
  shareUrl: "https://aios.co.il/shared/table/abc",
  requested: { whatsapp: true, email: true },
  sent: ["whatsapp", "email"],
  emailRecipients: ["client@example.com"],
};

/** Mounts the hook; `record` runs one mutation to completion. */
function renderRecorder() {
  const { queryClient, wrapper } = withTestQuery();
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  const { result } = renderHook(() => useRecordReportDelivery(), { wrapper });
  const record = async (input: ReportDeliveryInput) => {
    act(() => result.current.mutate(input));
    await waitFor(() => expect(result.current.isIdle).toBe(false));
    await waitFor(() => expect(result.current.isPending).toBe(false));
  };
  return { record, invalidate, result };
}

describe("useRecordReportDelivery", () => {
  beforeEach(() => {
    db.inserts.length = 0;
    db.insertError = null;
  });

  it("records a send with its link and the email recipients that got it", async () => {
    const { record } = renderRecorder();
    await record(reportSend);
    expect(db.inserts).toEqual([
      {
        table: "report_deliveries",
        row: {
          tenant_id: "tenant-1",
          client_id: "client-1",
          target_type: "table",
          target_id: "table-1",
          channels: ["whatsapp", "email"],
          status: "sent",
          details: {
            source: "manual",
            title: "דוח לידים",
            share_url: "https://aios.co.il/shared/table/abc",
            email_recipients: ["client@example.com"],
          },
        },
      },
    ]);
  });

  it("records only the channels that went out, as partial", async () => {
    const { record } = renderRecorder();
    await record({ ...reportSend, sent: ["whatsapp"] });
    expect(db.inserts[0].row).toMatchObject({
      channels: ["whatsapp"],
      status: "partial",
      details: { email_recipients: [] },
    });
  });

  it("records nothing when nothing went out or the send has no client", async () => {
    const { record, invalidate } = renderRecorder();
    await record({ ...reportSend, sent: [] });
    await record({ ...reportSend, clientId: null });
    expect(db.inserts).toEqual([]);
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("keeps a meeting summary's date and recording, with no link or recipients", async () => {
    const { record } = renderRecorder();
    await record({
      tenantId: "tenant-1",
      clientId: "client-1",
      targetType: "meeting_summary",
      targetId: "recording-1",
      title: "פגישת סטטוס",
      requested: { whatsapp: true, email: false },
      sent: ["whatsapp"],
      extraDetails: { meeting_date: "26.10.2026", recording_id: "recording-1" },
    });
    expect(db.inserts[0].row.details).toEqual({
      source: "manual",
      title: "פגישת סטטוס",
      meeting_date: "26.10.2026",
      recording_id: "recording-1",
    });
  });

  it("refreshes the client's card history after a recorded send", async () => {
    const { record, invalidate } = renderRecorder();
    await record(reportSend);
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ["client-updates", "client-1"],
    });
  });

  it("logs a failed write instead of throwing it", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    db.insertError = { code: "42501", message: "denied" };
    const { record, invalidate, result } = renderRecorder();
    await record(reportSend);
    expect(result.current.isError).toBe(true);
    expect(warn).toHaveBeenCalledWith(
      "Failed to log report delivery:",
      db.insertError,
    );
    expect(invalidate).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
