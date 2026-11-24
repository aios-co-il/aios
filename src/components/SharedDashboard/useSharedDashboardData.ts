import { keepPreviousData, skipToken, useQuery } from "@tanstack/react-query";
import { attachTableSettings } from "./attachTableSettings";
import {
  customDaysOf,
  isWindowReady,
  type SharedDashboardWindow,
  windowQuery,
} from "./sharedDashboardWindow";

/**
 * The share link's dashboard for the picked window, read from
 * public-dashboard. A custom range is read once both of its days are picked;
 * until then the last window's answer stays on screen, marked as placeholder.
 */
export function useSharedDashboardData(
  shareToken: string | undefined,
  dates: SharedDashboardWindow,
) {
  const { customFrom, customTo } = customDaysOf(dates);
  return useQuery({
    // A preset keeps its own key; a custom range adds its days.
    queryKey:
      dates.dateFilter === "custom"
        ? ["shared-dashboard", shareToken, "custom", customFrom, customTo]
        : ["shared-dashboard", shareToken, dates.dateFilter],
    queryFn:
      shareToken && isWindowReady(dates)
        ? () => fetchSharedDashboard(shareToken, dates)
        : skipToken,
    retry: false,
    // Keep a warm cache so reopening / date flips don't flash a blank screen.
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    // The header stays up while a custom range is being picked.
    placeholderData: keepPreviousData,
  });
}

/** The public-dashboard answer for one window, with each table's settings. */
async function fetchSharedDashboard(
  shareToken: string,
  dates: SharedDashboardWindow,
) {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const apiKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !apiKey) {
    throw new Error(
      "חסרה הגדרת Supabase בסביבת הפיתוח (VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY)",
    );
  }
  const params = new URLSearchParams({
    token: shareToken,
    ...windowQuery(dates),
  });
  // A GET with query parameters; the function reads no body, so
  // supabase.functions.invoke would add nothing here.
  const res = await fetch(
    `${supabaseUrl}/functions/v1/public-dashboard?${params.toString()}`,
    {
      method: "GET",
      headers: { apikey: apiKey, Authorization: `Bearer ${apiKey}` },
    },
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(body || `public-dashboard failed (${res.status})`);
  }
  return attachTableSettings(await res.json());
}
