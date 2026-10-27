import { PrivacyEmailLink } from "./PrivacyEmailLink";

export function EnglishInstructionsSection() {
  return (
    <section dir="ltr" className="text-left">
      <h2 className="text-2xl font-semibold mb-3">
        Data Deletion Instructions (English)
      </h2>
      <p className="mb-2">
        To delete the data Carmen Marketing OS holds from your Meta (Facebook,
        Instagram) or Google integrations:
      </p>
      <ul className="list-disc pl-6 space-y-2">
        <li>
          Disconnect the integration under Settings → Integrations. This stops
          Carmen Marketing OS from using the account right away; stored
          credentials and imported data are deleted only when a deletion request
          below is processed.
        </li>
        <li>
          Email <PrivacyEmailLink /> from your Carmen Marketing OS account
          email, naming the integration to delete.
        </li>
        <li>
          Removing Carmen Marketing OS from your Facebook apps settings sends us
          a deletion request; you will receive a confirmation code and a link to
          this page to check its status.
        </li>
      </ul>
      <p className="mt-3">
        Deletion is not automatic: every request is logged and processed
        manually by our team within 30 days. When processed, we delete the
        access tokens, integration settings and data imported from the connected
        account; backups are retained for up to 30 days after deletion.
      </p>
    </section>
  );
}
