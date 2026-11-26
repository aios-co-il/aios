import { useEffect, useRef } from "react";

/** The two lead fields the record's header edits beside the open form. */
export interface LeadStageAndStatus {
  status?: string | null;
  response_status?: string | null;
}

/**
 * Reports a stage or response status that changed outside the open lead form,
 * such as from the record header's quick selects. The form applies it, so a
 * later save keeps the change and does not fire the status automation again.
 * The values the form opened with are not reported.
 */
export function useLeadStageAndStatusSync(
  lead: LeadStageAndStatus,
  onOutsideChange: (changed: LeadStageAndStatus) => void,
) {
  const seen = useRef<LeadStageAndStatus>({
    status: lead.status,
    response_status: lead.response_status,
  });

  useEffect(() => {
    const unchanged =
      seen.current.status === lead.status &&
      seen.current.response_status === lead.response_status;
    if (unchanged) {
      return;
    }

    seen.current = {
      status: lead.status,
      response_status: lead.response_status,
    };
    onOutsideChange(seen.current);
  }, [lead.status, lead.response_status, onOutsideChange]);
}
