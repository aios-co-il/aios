import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { expect, test, vi } from "vitest";
import DataDeletion from "./DataDeletion";

test("a status box that fails to load keeps the deletion instructions", async () => {
  render(
    <MemoryRouter initialEntries={["/data-deletion?code=abc123"]}>
      <DataDeletion />
    </MemoryRouter>,
  );

  const status = screen.getByRole("status");

  expect(
    await screen.findByText(/We could not check the status right now/),
  ).toBeInTheDocument();
  expect(status).toHaveTextContent(/We could not check the status right now/);
  expect(screen.getByRole("button", { name: /Reload/ })).toBeInTheDocument();
  expect(
    screen.getByText("Data Deletion Instructions (English)"),
  ).toBeInTheDocument();
});

vi.mock("@/components/DataDeletionPage/DeletionStatusBox", () => {
  throw new Error(
    "Failed to fetch dynamically imported module: /assets/DeletionStatusBox.js",
  );
});
