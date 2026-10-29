import { PRIVACY_EMAIL } from "./constants";

export function PrivacyEmailLink() {
  return (
    <a
      href={`mailto:${PRIVACY_EMAIL}`}
      className="text-primary hover:underline"
    >
      {PRIVACY_EMAIL}
    </a>
  );
}
