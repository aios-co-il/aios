/** A share-link record: its table's id, and the settings filled from it. */
export type SharedTableRecord = {
  _tableId?: string;
  _integrationSettings?: Record<string, unknown> | null;
};

/** A table of the answer, with the public settings the link exposes. */
export type SharedSettingsTable = {
  id: string;
  integration_settings?: Record<string, unknown> | null;
};

/**
 * A public-dashboard answer with each record's `_integrationSettings` filled
 * from its table in `tables`. The function sends each table's public settings
 * once instead of on every record, so readers get records shaped as before.
 * A record that already has settings (an answer from before that change)
 * keeps them.
 */
export function attachTableSettings<
  R extends SharedTableRecord,
  T extends SharedSettingsTable,
  A extends { records?: Array<R>; tables?: Array<T> },
>(answer: A): A {
  const settingsOf = new Map(
    (answer.tables ?? []).map((table) => [
      table.id,
      table.integration_settings,
    ]),
  );
  return {
    ...answer,
    records: (answer.records ?? []).map((record) =>
      record._integrationSettings !== undefined || !record._tableId
        ? record
        : {
            ...record,
            _integrationSettings: settingsOf.get(record._tableId) ?? null,
          },
    ),
  };
}
