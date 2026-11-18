import { render, screen } from "@testing-library/react";
import { lazy, Suspense } from "react";
import { expect, test } from "vitest";
import { StatusBoxBoundary } from "./StatusBoxBoundary";

test("a status box that fails to load leaves the rest of the page in place", async () => {
  render(
    <main>
      <StatusBoxBoundary>
        <Suspense fallback={<p>Loading</p>}>
          <FailingStatusBox />
        </Suspense>
      </StatusBoxBoundary>
      <p>Deletion instructions</p>
    </main>,
  );

  expect(
    await screen.findByText(/We could not check the status right now/),
  ).toBeInTheDocument();
  expect(screen.getByText("Deletion instructions")).toBeInTheDocument();
});

const FailingStatusBox = lazy(() =>
  Promise.reject(
    new Error("Failed to fetch dynamically imported module: /assets/Status.js"),
  ),
);
