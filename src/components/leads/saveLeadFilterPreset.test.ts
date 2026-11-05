import { describe, expect, test, vi } from "vitest";
import type { FilterState } from "./LeadFiltersDialog";
import { saveLeadFilterPreset } from "./saveLeadFilterPreset";

const filters: FilterState = {
  searchQuery: "",
  salesPersonIds: ["sp-1"],
  stageIds: ["stage-1"],
  stageFilterMode: "show",
  responseStatus: [],
  responseStatusFilterMode: "hide",
  tagIds: [],
  startDate: undefined,
  endDate: undefined,
  followUpToday: false,
};

/** Records the inserted row and answers it as preset-new, or with the given error. */
function fakeDb(error: { message: string } | null) {
  const single = () =>
    Promise.resolve(
      error ? { data: null, error } : { data: { id: "preset-new" }, error },
    );
  const insert = vi.fn(() => ({ select: () => ({ single }) }));
  const from = vi.fn(() => ({ insert }));
  return { db: { from } as never, from, insert };
}

function callbacks() {
  return {
    onSaved: vi.fn(),
    onError: vi.fn(),
    onApply: vi.fn(),
    onOpenChange: vi.fn(),
  };
}

const preset = {
  tenantId: "tenant-1",
  userId: "user-1",
  name: "חמים",
  filters,
};

describe("saveLeadFilterPreset", () => {
  test("after saving, applies the filters as the new preset, so its tab is selected", async () => {
    const { db, from, insert } = fakeDb(null);
    const cb = callbacks();

    await saveLeadFilterPreset(db, preset, cb);

    expect(from).toHaveBeenCalledWith("lead_filter_presets");
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: "tenant-1",
        user_id: "user-1",
        name: "חמים",
        filters: expect.objectContaining({
          stageIds: ["stage-1"],
          responseStatusFilterMode: "hide",
        }),
      }),
    );
    expect(cb.onSaved).toHaveBeenCalledOnce();
    expect(cb.onApply).toHaveBeenCalledWith(filters, "preset-new");
    expect(cb.onOpenChange).toHaveBeenCalledWith(false);
    expect(cb.onError).not.toHaveBeenCalled();
  });

  test("an insert error keeps the dialog open and shows the error", async () => {
    const { db } = fakeDb({ message: "duplicate key" });
    const cb = callbacks();

    await saveLeadFilterPreset(db, preset, cb);

    expect(cb.onError).toHaveBeenCalledWith("duplicate key");
    expect(cb.onApply).not.toHaveBeenCalled();
    expect(cb.onOpenChange).not.toHaveBeenCalled();
    expect(cb.onSaved).not.toHaveBeenCalled();
  });
});
