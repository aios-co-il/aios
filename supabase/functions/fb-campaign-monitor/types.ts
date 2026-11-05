/** What one Graph read of a Meta ad account returns (see meta-account.ts). */
export type MetaCampaign = {
  id: string;
  name: string | null;
  effective_status: string | null;
  issues_count: number;
};

export type MetaAd = {
  id: string;
  name: string | null;
  effective_status: string | null;
  campaign: {
    id: string;
    name: string | null;
    effective_status: string | null;
  } | null;
};

/** One read of the ad account; every field comes from a call that succeeded. */
export type AccountSnapshot = {
  accountName: string | null;
  /** Graph account_status: 1 is active. */
  accountStatus: number;
  /** ACTIVE and WITH_ISSUES campaigns. */
  campaigns: MetaCampaign[];
  /** DISAPPROVED and PENDING_BILLING_INFO ads. */
  blockedAds: MetaAd[];
  /** At least one ad is live or in review (ACTIVE, PENDING_REVIEW, IN_PROCESS, PREAPPROVED). */
  hasLiveAd: boolean;
};
