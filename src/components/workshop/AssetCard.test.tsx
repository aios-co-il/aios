import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { AssetCard } from "./AssetCard";
import type { WorkshopAsset } from "./workshopAssets";

const asset = (patch: Partial<WorkshopAsset>): WorkshopAsset =>
  ({
    id: "a-1",
    asset_type: "link",
    source: "user",
    title: "נכס",
    url: null,
    storage_path: null,
    text: null,
    use_as_reference: false,
    meta: {},
    created_at: "2026-10-26T00:00:00Z",
    ...patch,
  }) as WorkshopAsset;

const renderCard = (value: WorkshopAsset) =>
  render(
    <AssetCard
      asset={value}
      referencesFull={false}
      onToggleReference={() => {}}
      onDelete={() => {}}
    />,
  );

test("a web address opens from the card", () => {
  renderCard(asset({ url: "https://example.com/brief" }));
  expect(screen.getByRole("link", { name: /פתחי/ })).toHaveAttribute(
    "href",
    "https://example.com/brief",
  );
});

test("an address that is not http(s) is never a link (a stored row can hold any text)", () => {
  renderCard(asset({ url: "javascript:alert(document.cookie)" }));
  expect(screen.queryByRole("link")).toBeNull();

  renderCard(
    asset({ id: "a-2", asset_type: "image", url: "JavaScript:alert(1)" }),
  );
  expect(screen.queryByRole("link")).toBeNull();
});
