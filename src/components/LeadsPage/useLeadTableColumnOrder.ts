import { useEffect, useRef, useState } from "react";
import {
  skipToken,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentTenant } from "@/hooks/useCurrentTenant";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { parseColumnOrder } from "@/components/resizableTableColumnOrder";

/** Where this browser kept the order before it moved to the user's account. */
export const LEGACY_LEAD_COLUMN_ORDER_STORAGE_KEY = "leads-table-column-order";

/**
 * The signed-in user's own CRM table column order, saved on their
 * `lead_list_defaults` row so it follows them to every device and never changes
 * another user's table. An order this browser saved before is moved to the
 * account once, then removed from the browser.
 */
export function useLeadTableColumnOrder() {
  const { tenantId } = useCurrentTenant();
  const { userId } = useCurrentUser();
  const queryClient = useQueryClient();
  // Holds only orders the database confirmed; a pending drag lives in pendingOrder.
  const queryKey = ["lead-column-order", tenantId, userId] as const;
  const [legacyOrder] = useState(readLegacyColumnOrder);
  const [pendingOrder, setPendingOrder] = useState<Array<string> | null>(null);
  const latestPending = useRef<Array<string> | null>(null);
  const legacyChecked = useRef(false);

  const {
    data: savedOrder,
    isSuccess,
    error,
  } = useQuery({
    queryKey,
    queryFn:
      tenantId && userId ? () => fetchColumnOrder(tenantId, userId) : skipToken,
  });

  const { mutate: saveOrder } = useMutation({
    // One scope per user and tenant runs saves one at a time, in drag order, so
    // an earlier order can never land after a later one.
    scope: { id: `lead-column-order:${tenantId}:${userId}` },
    mutationFn: async ({ order, isMigration }: ColumnOrderSave) => {
      await queryClient.cancelQueries({ queryKey });
      if (isMigration) {
        // A migration can queue behind a drag (from another mount of this hook);
        // when it runs, any order already on the account wins over the old one.
        const current = await fetchColumnOrder(
          requireId(tenantId),
          requireId(userId),
        );
        if (current !== null) {
          return current;
        }
      }
      await saveColumnOrder(tenantId, userId, order);
      return order;
    },
    onSuccess: (order) => {
      queryClient.setQueryData(queryKey, order);
    },
    onError: (saveError) => {
      console.error("Failed to save CRM column order", saveError);
      toast.error("לא ניתן לשמור את סדר העמודות");
    },
    onSettled: (_data, _error, { order }) => {
      // Only the latest drag clears the pending order; an earlier save that
      // settles after a newer drag leaves the newer order on screen.
      if (latestPending.current === order) {
        latestPending.current = null;
        setPendingOrder(null);
      }
    },
  });

  useEffect(() => {
    if (error) {
      console.error("Failed to load CRM column order", error);
      toast.error("לא ניתן לטעון את סדר העמודות השמור");
    }
  }, [error]);

  // Moves the browser's old order to the account once the account's row is known.
  useEffect(() => {
    if (!isSuccess || legacyChecked.current) {
      return;
    }
    legacyChecked.current = true;
    if (legacyOrder.length === 0) {
      return;
    }
    if (savedOrder !== null) {
      // The database already holds an order, from this or another device; it wins.
      clearLegacyColumnOrder();
      return;
    }
    // The browser copy stays until the account confirms the write.
    saveOrder(
      { order: legacyOrder, isMigration: true },
      { onSuccess: clearLegacyColumnOrder },
    );
  }, [isSuccess, savedOrder, legacyOrder, saveOrder]);

  /** Shows the dragged order at once and queues its save. */
  function setOrder(order: Array<string>) {
    latestPending.current = order;
    setPendingOrder(order);
    saveOrder({ order, isMigration: false });
  }

  return {
    order: pendingOrder ?? savedOrder ?? legacyOrder,
    // Reordering waits for the saved order: a drag over the default order would
    // otherwise overwrite the order this user saved on another device.
    setOrder: isSuccess ? setOrder : undefined,
  };
}

interface ColumnOrderSave {
  order: Array<string>;
  /** Moving the browser's old order: skipped when the account already has one. */
  isMigration: boolean;
}

/** The signed-in user or tenant id; saving without one is a bug, so it throws. */
function requireId(id: string | null | undefined): string {
  if (!id) {
    throw new Error("No signed-in user or organization to save the order for");
  }
  return id;
}

/** The user's saved CRM column order, or null when they have none. */
async function fetchColumnOrder(
  tenantId: string,
  userId: string,
): Promise<Array<string> | null> {
  const { data, error } = await supabase
    .from("lead_list_defaults")
    .select("column_order")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    throw error;
  }
  return data?.column_order ?? null;
}

/**
 * Upserts the user's own row. Only column_order is sent, so a saved stage scope
 * stays as it was; RLS refuses any other user or tenant.
 */
async function saveColumnOrder(
  tenantId: string | null | undefined,
  userId: string | undefined,
  order: Array<string>,
): Promise<void> {
  const { error } = await supabase.from("lead_list_defaults").upsert(
    {
      tenant_id: requireId(tenantId),
      user_id: requireId(userId),
      column_order: order,
    },
    { onConflict: "tenant_id,user_id" },
  );
  if (error) {
    throw error;
  }
}

/** The order this browser saved before; none when storage is blocked. */
function readLegacyColumnOrder(): Array<string> {
  try {
    return parseColumnOrder(
      window.localStorage.getItem(LEGACY_LEAD_COLUMN_ORDER_STORAGE_KEY),
    );
  } catch {
    return [];
  }
}

/** Removes the browser copy once the account holds the order. */
function clearLegacyColumnOrder(): void {
  try {
    window.localStorage.removeItem(LEGACY_LEAD_COLUMN_ORDER_STORAGE_KEY);
  } catch (error) {
    console.warn("Could not clear the old browser column order", error);
  }
}
