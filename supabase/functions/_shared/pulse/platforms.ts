/** An ad platform the pulse reads campaign tables from. */
export type PulsePlatform = "meta" | "google";

/** The report-table integration types of each ad platform. */
export const PULSE_PLATFORM_INTEGRATION_TYPES: Readonly<
  Record<PulsePlatform, readonly string[]>
> = {
  meta: ["facebook_insights", "facebook_ecommerce"],
  google: ["google_ads"],
};

/** Every report-table integration type the pulse reads, Meta first. */
export const PULSE_AD_INTEGRATION_TYPES: readonly string[] = [
  ...PULSE_PLATFORM_INTEGRATION_TYPES.meta,
  ...PULSE_PLATFORM_INTEGRATION_TYPES.google,
];

/** Is this one of the ad platforms the pulse reads? */
export function isPulsePlatform(value: unknown): value is PulsePlatform {
  return PLATFORMS.some((platform) => platform === value);
}

/** The platform a report table belongs to; null for a table of no ad platform. */
export function pulsePlatformOf(
  integrationType: string | null | undefined,
): PulsePlatform | null {
  return (
    PLATFORMS.find((platform) =>
      PULSE_PLATFORM_INTEGRATION_TYPES[platform].includes(
        integrationType ?? "",
      ),
    ) ?? null
  );
}

/** The platform's name as the pulse shows it. */
export function pulsePlatformName(platform: PulsePlatform): string {
  return platform === "meta" ? "Meta" : "Google Ads";
}

const PLATFORMS: readonly PulsePlatform[] = ["meta", "google"];
