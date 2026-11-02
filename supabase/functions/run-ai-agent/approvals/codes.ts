/** The row fields a code is derived from. */
interface CodeRow {
  id?: string | null;
}

/**
 * Code shown for `row` in a list of `rows`: the 4-digit code, or the 6-digit one
 * when another listed row has the same 4 digits, so every listed row can be picked.
 */
export function approvalDisplayCode(
  row: CodeRow | null | undefined,
  rows: readonly (CodeRow | null | undefined)[] = [],
): string {
  const short = approvalShortCode(row?.id);
  const list = Array.isArray(rows) ? rows : [];
  const clash = list.some(
    (r) => r?.id && r.id !== row?.id && approvalShortCode(r.id) === short,
  );
  return clash ? approvalLongCode(row?.id) : short;
}

/** Does a typed code (4 or 6 digits) name this row? */
export function approvalCodeMatches(
  row: CodeRow | null | undefined,
  code: string | null | undefined,
): boolean {
  const c = String(code || "");
  if (!row?.id || !c) {
    return false;
  }

  return c.length === 6
    ? approvalLongCode(row.id) === c
    : approvalShortCode(row.id) === c;
}

/**
 * Short numeric code for a row, stable for its id. Years (1900-2099) and round
 * hundreds are skipped so a reply like "כן 2026" or "כן 5000" rarely hits a code.
 */
export function approvalShortCode(id: string | null | undefined): string {
  const hex = String(id || "")
    .replace(/[^0-9a-f]/gi, "")
    .slice(0, 8);
  let n = hex ? parseInt(hex, 16) % 10000 : 0;
  for (let i = 0; i < 10; i++) {
    const looksNatural = (n >= 1900 && n <= 2099) || n % 100 === 0;
    if (!looksNatural) {
      break;
    }

    n = (n + 4321) % 10000;
  }

  return String(n).padStart(4, "0");
}

/** 6-digit code for a row whose 4-digit code collides with another listed row. */
export function approvalLongCode(id: string | null | undefined): string {
  const hex = String(id || "")
    .replace(/[^0-9a-f]/gi, "")
    .slice(0, 12);
  const n = hex ? parseInt(hex, 16) % 1_000_000 : 0;
  return String(n).padStart(6, "0");
}
