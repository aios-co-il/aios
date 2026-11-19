import { useState, type DragEvent } from "react";
import {
  moveColumnId,
  readColumnOrder,
  writeColumnOrder,
} from "./resizableTableColumnOrder";

/**
 * Drag-and-drop header reordering for ResizableTable, saved per browser under
 * `storageKey`. Without a key the table keeps its default order and headers are
 * not draggable.
 */
export function useColumnReorder(storageKey: string | undefined) {
  const [order, setOrder] = useState<Array<string>>(() =>
    storageKey && typeof window !== "undefined"
      ? readColumnOrder(window.localStorage, storageKey)
      : [],
  );
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  function reset() {
    setDragId(null);
    setOverId(null);
  }

  /** Drag props for one header; `currentIds` is the order the table shows now. */
  function getHeaderDragProps(columnId: string, currentIds: Array<string>) {
    if (!storageKey) {
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
          const next = moveColumnId(currentIds, dragId, columnId);
          setOrder(next);
          writeColumnOrder(window.localStorage, storageKey, next);
        }
        reset();
      },
      onDragEnd: reset,
    };
  }

  return { order, dragId, overId, getHeaderDragProps };
}
