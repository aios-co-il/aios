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
  const queryKey = ["lead-column-order", tenantId, userId] as const;
  const [legacyOrder] = useState(readLegacyColumnOrder);
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
    mutationFn: (order: Array<string>) =>
      saveColumnOrder(tenantId, userId, order),
    onMutate: async (order) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<Array<string> | null>(queryKey);
      queryClient.setQueryData(queryKey, order);
      return { previous };
    },
    onError: (saveError, _order, context) => {
      console.error("Failed to save CRM column order", saveError);
      queryClient.setQueryData(queryKey, context?.previous ?? null);
      toast.error("לא ניתן לשמור את סדר העמודות");
    },
  });

  useEffect(() => {
    if (error) {
      console.error("Failed to load CRM column order", error);
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
      // The account already has an order, from this or another device; it wins.
      clearLegacyColumnOrder();
      return;
    }
    saveOrder(legacyOrder, { onSuccess: clearLegacyColumnOrder });
  }, [isSuccess, savedOrder, legacyOrder, saveOrder]);

  return {
    order: savedOrder ?? legacyOrder,
    setOrder: (order: Array<string>) => saveOrder(order),
  };
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
  if (!tenantId || !userId) {
    throw new Error("No signed-in user or organization to save the order for");
  }
  const { error } = await supabase
    .from("lead_list_defaults")
    .upsert(
      { tenant_id: tenantId, user_id: userId, column_order: order },
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
