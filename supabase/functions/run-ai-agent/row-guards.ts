import type { Json } from "../_shared/database.types.ts";
import { isObject } from "./json-config.ts";
import { readField } from "./tool-contracts-admin.ts";

/** Field validators for rows whose select shape the generated types cannot express. */
export type FieldCheck = (value: unknown) => boolean;

export const isString: FieldCheck = (value) => typeof value === "string";
export const isNumber: FieldCheck = (value) => typeof value === "number";
export const isBoolean: FieldCheck = (value) => typeof value === "boolean";

export const nullable =
  (check: FieldCheck): FieldCheck =>
  (value) =>
    value === null || check(value);

export const optional =
  (check: FieldCheck): FieldCheck =>
  (value) =>
    value === undefined || check(value);

export const oneOf =
  (values: readonly string[]): FieldCheck =>
  (value) =>
    typeof value === "string" && values.includes(value);

export function isJson(value: unknown): value is Json {
  if (value === null || ["string", "number", "boolean"].includes(typeof value))
    return true;
  if (Array.isArray(value)) return value.every(isJson);
  return (
    isObject(value) &&
    Object.values(value).every((entry) => entry === undefined || isJson(entry))
  );
}

export const isNamedRelation = nullable((value) =>
  isString(readField(value, "name")),
);

export function matchesFields(
  value: unknown,
  fields: Record<string, FieldCheck>,
): boolean {
  return (
    isObject(value) &&
    Object.entries(fields).every(([key, check]) =>
      check(Reflect.get(value, key)),
    )
  );
}
