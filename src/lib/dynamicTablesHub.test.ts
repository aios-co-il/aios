import { expect, test } from "vitest";
import {
  appendCategorySearchParam,
  DYNAMIC_TABLES_CATEGORY_PARAM,
  stripCategorySearchParam,
} from "./dynamicTablesHub.ts";

test("appendCategorySearchParam adds category to tenant path", () => {
  const path = appendCategorySearchParam("/t/demo/dynamic-tables", "SEO");
  expect(path).toBe(
    `/t/demo/dynamic-tables?${DYNAMIC_TABLES_CATEGORY_PARAM}=SEO`,
  );
});

test("stripCategorySearchParam returns hub path", () => {
  const path = stripCategorySearchParam(
    `/t/demo/dynamic-tables?${DYNAMIC_TABLES_CATEGORY_PARAM}=SEO&tab=tables`,
  );
  expect(path).toBe("/t/demo/dynamic-tables?tab=tables");
});

test("stripCategorySearchParam removes only category param", () => {
  expect(
    stripCategorySearchParam(
      `/t/demo/dynamic-tables?${DYNAMIC_TABLES_CATEGORY_PARAM}=SEO`,
    ),
  ).toBe("/t/demo/dynamic-tables");
});
