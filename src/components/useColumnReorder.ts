import { useState, type DragEvent } from "react";
import { moveColumnId } from "./resizableTableColumnOrder";

/**
 * Drag-and-drop header state for ResizableTable. Headers are draggable only when
 * `onReorder` is set; it receives the full new column-id order on each drop. A
 * column moves only within its group (pinned or not), because the table always
 * renders pinned columns first and a cross-group drop would not show.
 */
export function useColumnReorder(
  onReorder: ((order: Array<string>) => void) | undefined,
) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragGroup, setDragGroup] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  function reset() {
    setDragId(null);
    setDragGroup(null);
    setOverId(null);
  }

  /**
   * Drag props for one header. `currentIds` is the order the table shows now and
   * `group` names the header's group; drops are accepted only within one group.
   */
  function getHeaderDragProps(
    columnId: string,
    currentIds: Array<string>,
    group: string,
  ) {
    if (!onReorder) {
      return {};
    }
    return {
      draggable: true,
      onDragStart: (event: DragEvent<HTMLElement>) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", columnId);
        setDragId(columnId);
        setDragGroup(group);
      },
      onDragOver: (event: DragEvent<HTMLElement>) => {
        if (!dragId || dragGroup !== group) {
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
        if (dragId && dragId !== columnId && dragGroup === group) {
          onReorder(moveColumnId(currentIds, dragId, columnId));
        }
        reset();
      },
      onDragEnd: reset,
    };
  }

  return { dragId, overId, getHeaderDragProps };
}
