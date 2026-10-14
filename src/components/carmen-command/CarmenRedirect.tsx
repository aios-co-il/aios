import type { ReactNode } from "react";
import { Navigate, useParams } from "react-router-dom";
import { useCommandCenterAccess } from "./access";

/**
 * Old Carmen-management pages (agents, skins, agent tasks) now live inside
 * Carmen's screen. Users with Command Center access are sent there, opened on
 * the matching panel; everyone else keeps the original page.
 */
export function CarmenRedirect({
  panel,
  fallback,
}: {
  panel: string;
  fallback: ReactNode;
}) {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const access = useCommandCenterAccess();
  if (access.loading) return null;
  if (!access.allowed || !tenantSlug) return <>{fallback}</>;
  return (
    <Navigate
      to={`/t/${tenantSlug}/command-center?panel=${encodeURIComponent(panel)}`}
      replace
    />
  );
}
