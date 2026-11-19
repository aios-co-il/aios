import { useState, type DragEvent } from "react";
import { moveColumnId } from "./resizableTableColumnOrder";

/**
 * Drag-and-drop header state for ResizableTable. Headers are draggable only when
 * `onReorder` is set; it receives the full new column-id order on each drop.
 */
export function useColumnReorder(
  onReorder: ((order: Array<string>) => void) | undefined,
) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  function reset() {
    setDragId(null);
    setOverId(null);
  }

  /** Drag props for one header; `currentIds` is the order the table shows now. */
  function getHeaderDragProps(columnId: string, currentIds: Array<string>) {
    if (!onReorder) {
      return {};
    }
    return {
      draggable: true,
      onDragStart: (event: DragEvent<HTMLElement>) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", columnId);
        setDragId(columnId);
      },
      onDragOver: (event: DragEvent<HTMLElement>) => {
        if (!dragId) {
          return;
        }
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        if (overId !== columnId) {
          setOverId(columnId);
        }
      },
      onDrop: (event: DragEvent<HTMLElement>) => {
        event.preventDefault();
        if (dragId && dragId !== columnId) {
          onReorder(moveColumnId(currentIds, dragId, columnId));
        }
        reset();
      },
      onDragEnd: reset,
    };
  }

  return { dragId, overId, getHeaderDragProps };
}
