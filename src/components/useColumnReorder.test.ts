import { act, renderHook } from "@testing-library/react";
import type { DragEvent } from "react";
import { describe, expect, it, vi } from "vitest";
import { useColumnReorder } from "./useColumnReorder";

/** A minimal drag event: the hook reads dataTransfer and calls preventDefault. */
function dragEvent() {
  return {
    preventDefault: vi.fn(),
    dataTransfer: { setData: vi.fn(), effectAllowed: "", dropEffect: "" },
  } as unknown as DragEvent<HTMLElement> & { preventDefault: () => void };
}

// The order as rendered: pinned "name" first, then the regular columns.
const displayed = ["name", "phone", "status"];

/** Drags `fromId` (in `fromGroup`) and drops it on `toId` (in `toGroup`). */
function dragAndDrop(
  onReorder: (order: Array<string>) => void,
  [fromId, fromGroup]: [string, string],
  [toId, toGroup]: [string, string],
) {
  const { result } = renderHook(() => useColumnReorder(onReorder));
  act(() =>
    result.current
      .getHeaderDragProps(fromId, displayed, fromGroup)
      .onDragStart?.(dragEvent()),
  );
  const over = dragEvent();
  act(() =>
    result.current
      .getHeaderDragProps(toId, displayed, toGroup)
      .onDragOver?.(over),
  );
  act(() =>
    result.current
      .getHeaderDragProps(toId, displayed, toGroup)
      .onDrop?.(dragEvent()),
  );
  return { over };
}

describe("useColumnReorder", () => {
  it("moves a column within its group in the displayed order", () => {
    const onReorder = vi.fn();
    const { over } = dragAndDrop(
      onReorder,
      ["status", "regular"],
      ["phone", "regular"],
    );
    expect(over.preventDefault).toHaveBeenCalled();
    expect(onReorder).toHaveBeenCalledWith(["name", "status", "phone"]);
  });

  it("refuses a drop across the pinned boundary, which the table could not show", () => {
    const onReorder = vi.fn();
    const { over } = dragAndDrop(
      onReorder,
      ["phone", "regular"],
      ["name", "pinned"],
    );
    expect(over.preventDefault).not.toHaveBeenCalled();
    expect(onReorder).not.toHaveBeenCalled();
  });

  it("makes headers draggable only when reordering is allowed", () => {
    const { result } = renderHook(() => useColumnReorder(undefined));
    expect(
      result.current.getHeaderDragProps("name", displayed, "pinned"),
    ).toEqual({});
  });
});
