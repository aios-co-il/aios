import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const authSessionQueryOptions = queryOptions({
  queryKey: ["authPage", "session"],
  queryFn: readSession,
  staleTime: 0,
  gcTime: 0,
  retry: false,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
});

/** Read the SDK session without retaining auth tokens after the page unmounts. */
async function readSession() {
  const { data, error } = await supabase.auth.getSession();

  if (error) {
    throw error;
  }

  return data.session;
}
