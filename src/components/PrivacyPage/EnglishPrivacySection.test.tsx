import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { expect, test } from "vitest";
import { EnglishPrivacySection } from "./EnglishPrivacySection";

const LIMITED_USE_DISCLOSURE =
  "AIOS's use and transfer to any other app of information received from Google APIs will adhere to the Google API Services User Data Policy, including the Limited Use requirements.";

test("shows Google's Limited Use disclosure word for word", () => {
  render(
    <MemoryRouter>
      <EnglishPrivacySection />
    </MemoryRouter>,
  );

  const disclosure = screen.getByText(/use and transfer to any other app/);

  expect(disclosure.textContent).toBe(LIMITED_USE_DISCLOSURE);
  expect(
    screen.getByRole("link", { name: "Google API Services User Data Policy" }),
  ).toHaveAttribute(
    "href",
    "https://developers.google.com/terms/api-services-user-data-policy",
  );
});

test("states that Google data does not train generalized AI models", () => {
  render(
    <MemoryRouter>
      <EnglishPrivacySection />
    </MemoryRouter>,
  );

  expect(
    screen.getByText(/develop, improve or train generalized AI/),
  ).toBeInTheDocument();
});
