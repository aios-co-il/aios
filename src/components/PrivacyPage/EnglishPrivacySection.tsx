import { Link } from "react-router-dom";
import { PrivacyEmailLink } from "@/components/DataDeletionPage/PrivacyEmailLink";

const GOOGLE_USER_DATA_POLICY_URL =
  "https://developers.google.com/terms/api-services-user-data-policy";

const GOOGLE_PERMISSIONS_URL = "https://myaccount.google.com/permissions";

const GOOGLE_DATA_USES = [
  {
    service: "Google Calendar",
    use: "list your calendars and create, update and read the events you schedule from AIOS (meetings with clients and leads).",
  },
  {
    service: "Gmail",
    use: "read messages to log client communication and import invoice attachments, send emails you write or approve in AIOS, and label messages AIOS has processed.",
  },
  {
    service: "Google Ads",
    use: "read campaign, cost and performance data of the ad accounts you connect, for reports.",
  },
  {
    service: "Google Analytics",
    use: "read-only access to traffic and conversion data of the properties you select, for reports.",
  },
  {
    service: "Google Search Console",
    use: "read-only access to search queries and rankings of the sites you verified, for SEO reports.",
  },
  {
    service: "Google account email",
    use: "show which Google account is connected to AIOS.",
  },
];

export function EnglishPrivacySection() {
  return (
    <section dir="ltr" lang="en" className="text-left">
      <h2 className="text-2xl font-semibold mb-3">
        Privacy Policy Summary (English)
      </h2>
      <p className="mb-3">
        AIOS is a CRM and marketing platform for agencies. This section
        summarizes how AIOS handles data from the Google and Meta accounts you
        connect. The full policy above is in Hebrew; both versions apply.
      </p>

      <h3 className="text-lg font-medium mt-4 mb-2">Google user data</h3>
      <p className="mb-2">
        When you connect a Google account, AIOS uses the data only to provide
        the features you turn on:
      </p>
      <ul className="list-disc pl-6 space-y-2">
        {GOOGLE_DATA_USES.map(({ service, use }) => (
          <li key={service}>
            <strong>{service}:</strong> {use}
          </li>
        ))}
      </ul>

      <div className="bg-muted/50 p-4 rounded-lg border mt-4">
        <p className="mb-3">
          AIOS&apos;s use and transfer to any other app of information received
          from Google APIs will adhere to the{" "}
          <a
            href={GOOGLE_USER_DATA_POLICY_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            Google API Services User Data Policy
          </a>
          , including the Limited Use requirements.
        </p>
        <ul className="list-disc pl-6 space-y-1">
          <li>We do not sell Google user data.</li>
          <li>
            We do not use Google user data for advertising, retargeting or
            interest-based ads, and we do not use it to determine credit
            worthiness or for lending.
          </li>
          <li>
            We do not use Google user data to develop, improve or train
            generalized AI or machine learning models.
          </li>
          <li>
            When you use AI features (such as the Carmen assistant or invoice
            extraction), the relevant content is sent to our AI processing
            provider only to produce the result you asked for, and is not used
            by that provider to train its models.
          </li>
          <li>
            Our staff do not read Google user data, except with your consent,
            when needed for security or to comply with the law.
          </li>
        </ul>
      </div>

      <h3 className="text-lg font-medium mt-4 mb-2">Meta data</h3>
      <p className="mb-2">
        When you connect Facebook or Instagram, AIOS reads your pages, business
        accounts, ad accounts, campaigns and Lead Ads leads (name, email,
        phone), and publishes posts and manages comments and messages only when
        you ask it to. We do not sell this data or use it for purposes other
        than the features you configure.
      </p>

      <h3 className="text-lg font-medium mt-4 mb-2">
        Storage, retention and deletion
      </h3>
      <p className="mb-2">
        Data is encrypted in transit and at rest, and each organization&apos;s
        data is isolated. Access tokens and imported data are kept while the
        integration is connected. You can disconnect any integration under
        Settings → Integrations, revoke AIOS&apos;s Google access at{" "}
        <a
          href={GOOGLE_PERMISSIONS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline"
        >
          myaccount.google.com/permissions
        </a>
        , and ask us to delete your data as described on the{" "}
        <Link to="/data-deletion" className="text-primary hover:underline">
          data deletion page
        </Link>
        . Deletion requests are processed within 30 days.
      </p>
      <p>
        Contact: <PrivacyEmailLink />
      </p>
    </section>
  );
}
