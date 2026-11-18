import { render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, test } from "vitest";
import Privacy from "@/pages/Privacy";

const LIMITED_USE_DISCLOSURE =
  "AIOS's use and transfer to any other app of information received from Google APIs will adhere to the Google API Services User Data Policy, including the Limited Use requirements.";

describe("public privacy page English section", () => {
  test("shows Google's Limited Use disclosure word for word", () => {
    const english = renderPrivacy();
    const disclosure = english.getByText(/use and transfer to any other app/);

    expect(disclosure.textContent).toBe(LIMITED_USE_DISCLOSURE);
    expect(
      english.getByRole("link", {
        name: "Google API Services User Data Policy",
      }),
    ).toHaveAttribute(
      "href",
      "https://developers.google.com/terms/api-services-user-data-policy",
    );
  });

  test("states that Google data does not train generalized AI models", () => {
    const english = renderPrivacy();

    expect(
      english.getByText(
        /do not use Google user data to develop, improve or train generalized AI/,
      ),
    ).toBeInTheDocument();
  });
});

/** Render the public route and scope queries to its English policy. */
function renderPrivacy() {
  render(
    <MemoryRouter initialEntries={["/privacy"]}>
      <Routes>
        <Route path="/privacy" element={<Privacy />} />
      </Routes>
    </MemoryRouter>,
  );

  return within(
    screen.getByRole("region", { name: "Privacy Policy Summary (English)" }),
  );
}
