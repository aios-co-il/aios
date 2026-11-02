/** An ad platform the pulse reads campaign tables from. */
export type PulsePlatform = "meta" | "google";

/** The ad platforms the pulse reads, Meta first. */
export const PULSE_PLATFORMS: readonly PulsePlatform[] = ["meta", "google"];

/**
 * The report-table integration types of each ad platform. The dashboard editor,
 * the attention matrix and Carmen's tools all pick a platform's tables from this
 * map, so a target is written to the same tables it is read from.
 */
export const PULSE_PLATFORM_INTEGRATION_TYPES: Readonly<
  Record<PulsePlatform, readonly string[]>
> = {
  meta: ["facebook_insights", "facebook_ecommerce"],
  google: ["google_ads"],
};

/** Every report-table integration type the pulse reads, Meta first. */
export const PULSE_AD_INTEGRATION_TYPES: readonly string[] =
  PULSE_PLATFORMS.flatMap(
    (platform) => PULSE_PLATFORM_INTEGRATION_TYPES[platform],
  );

/** Is this one of the ad platforms the pulse reads? */
export function isPulsePlatform(value: unknown): value is PulsePlatform {
  return PULSE_PLATFORMS.some((platform) => platform === value);
}

/** The platform a report table belongs to; null for a table of no ad platform. */
export function pulsePlatformOf(
  integrationType: string | null | undefined,
): PulsePlatform | null {
  return (
    PULSE_PLATFORMS.find((platform) =>
      PULSE_PLATFORM_INTEGRATION_TYPES[platform].includes(
        integrationType ?? "",
      ),
    ) ?? null
  );
}

/** The platform's full name, as alerts, Carmen and the target editor show it. */
export function pulsePlatformName(platform: PulsePlatform): string {
  return PLATFORM_NAMES[platform].full;
}

/** The platform's short name, as the dashboard's "Google · לידים" labels show it. */
export function pulsePlatformShortName(platform: PulsePlatform): string {
  return PLATFORM_NAMES[platform].short;
}

const PLATFORM_NAMES: Readonly<
  Record<PulsePlatform, { full: string; short: string }>
> = {
  meta: { full: "Meta", short: "Meta" },
  google: { full: "Google Ads", short: "Google" },
};
