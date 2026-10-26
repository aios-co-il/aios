import { useEffect, useMemo, useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";

/** The `list-user-tenants` entry fields that `isUserTenant` validates. */
export interface UserTenant {
  id: string;
  name: string;
  org_type: string;
  slug?: string | null;
  parent_tenant_id?: string | null;
  status?: string | null;
}

type Candidate = Partial<Record<keyof UserTenant, unknown>>;

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value !== "";

const isOptionalString = (value: unknown) =>
  value === undefined || value === null || typeof value === "string";

function isUserTenant(value: unknown): value is UserTenant {
  if (typeof value !== "object" || value === null) return false;
  const tenant: Candidate = value;
  return (
    isNonEmptyString(tenant.id) &&
    isNonEmptyString(tenant.name) &&
    typeof tenant.org_type === "string" &&
    isOptionalString(tenant.slug) &&
    isOptionalString(tenant.parent_tenant_id) &&
    isOptionalString(tenant.status)
  );
}

function readTenants(payload: unknown): unknown {
  return typeof payload === "object" && payload !== null && "tenants" in payload
    ? payload.tenants
    : undefined;
}

/**
 * Stable fetch of user tenants via backend function, only after auth token is ready.
 * Filters out invalid entries and keeps previous data to avoid flicker.
 * Now includes currentTenantId to scope the results based on URL context.
 */
export function useUserTenants(userId?: string | null) {
  const [token, setToken] = useState<string | null>(null);
  const { currentTenantId } = useTenant();

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (mounted) setToken(session?.access_token ?? null);
    };

    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_e, session) => {
        setToken(session?.access_token ?? null);
      },
    );

    init();

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const query = useQuery({
    queryKey: ["user-tenants", userId, token, currentTenantId],
    enabled: !!userId && !!token,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke<unknown>(
        "list-user-tenants",
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: {
            scope_tenant_id: currentTenantId,
          },
        },
      );

      if (error) {
        console.error("Error fetching user tenants:", error);
        return [];
      }

      const tenants = readTenants(data);
      // Ensure tenants is always an array before filtering
      if (!Array.isArray(tenants)) {
        console.warn("Tenants data is not an array:", tenants);
        return [];
      }

      // sanitize
      return tenants.filter(isUserTenant);
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 2,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    placeholderData: keepPreviousData,
  });

  return useMemo(
    () => ({
      userTenants: query.data ?? [],
      isLoading: query.isLoading || query.isFetching,
      refetch: query.refetch,
    }),
    [query.data, query.isLoading, query.isFetching, query.refetch],
  );
}
