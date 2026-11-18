import { render } from "@testing-library/react";
import { expect, test } from "vitest";
import { DEFAULT_DOCUMENT_TITLE, PRIVACY_PAGE } from "./legalPages";
import { useLegalPageTitle } from "./useLegalPageTitle";

test("shows the page title while mounted and the app title after", () => {
  const { unmount } = render(<TitledPage />);

  expect(document.title).toBe(PRIVACY_PAGE.title);

  unmount();

  expect(document.title).toBe(DEFAULT_DOCUMENT_TITLE);
});

function TitledPage() {
  useLegalPageTitle(PRIVACY_PAGE);

  return null;
}
