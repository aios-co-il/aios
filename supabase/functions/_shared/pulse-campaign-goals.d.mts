export const PULSE_CAMPAIGN_GOALS: readonly string[];
export function resolveCampaignDeliveryStatus(...args: never[]): unknown;
export function campaignDeliveryStatusLabel(...args: never[]): unknown;
export function tableReportGoal(...args: never[]): unknown;
export function isEcommerceReportTable(...args: never[]): unknown;
export function integrationTypeToGoal(...args: never[]): unknown;
export function classificationDataFromStoredRow(...args: never[]): unknown;
export function classifyPulseCampaignGoal(...args: never[]): unknown;
export function pulseCampaignOutcome(...args: never[]): unknown;
type YmdWindow = { start: string; end: string };

export function pulseTrendWindows(nowYmd: string): {
  current3: YmdWindow;
  current7: YmdWindow;
  baseline: YmdWindow;
  today: string;
  queryStart: string;
  queryEnd: string;
};
export function dedupePulseCampaignRows(...args: never[]): unknown;
export function buildPulseCampaignRows(...args: never[]): unknown;
