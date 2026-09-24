// CSV text -> rows for reconcile(). Pure, so malformed-file handling is unit tested.
// Blank lines are kept while parsing (and skipped later) so line numbers in error
// messages match what the user sees in a spreadsheet.

import Papa from "papaparse";
import { missingColumns, normaliseHeader, reconcile, type RawRow, type ReconcileResult, type RejectedRow, type SystemPayment } from "@/lib/domain/reconcile";

export const MAX_FILE_BYTES = 1_000_000;
export const MAX_ROWS = 5000;

export type ParsedCsv =
  | { ok: true; rows: RawRow[]; structural: RejectedRow[] }
  | { ok: false; code: "empty_file" | "missing_columns" | "too_many_rows"; message: string };

export function parseSettlementCsv(text: string): ParsedCsv {
  const body = text.replace(/^﻿/, "");
  if (body.trim() === "") return { ok: false, code: "empty_file", message: "The file is empty." };

  const parsed = Papa.parse<RawRow>(body, {
    header: true,
    skipEmptyLines: false,
    transformHeader: normaliseHeader,
  });

  const headers = parsed.meta.fields ?? [];
  const missing = missingColumns(headers);
  if (missing.length > 0) {
    return {
      ok: false,
      code: "missing_columns",
      message: `The file is missing ${missing.length === 1 ? "the column" : "columns"} ${missing.join(", ")}. Expected header: gateway_ref,amount_inr,status,settled_at.`,
    };
  }

  const rows = parsed.data;
  if (rows.length > MAX_ROWS) {
    return { ok: false, code: "too_many_rows", message: `The file has ${rows.length} rows; the limit is ${MAX_ROWS}. Split it and upload each part.` };
  }

  // Rows with the wrong number of fields are rejected here and blanked, so reconcile()
  // skips them but line numbers stay aligned.
  const structural: RejectedRow[] = [];
  const isBlank = (r: RawRow | undefined) => !r || Object.values(r).every((v) => (typeof v === "string" ? v.trim() === "" : v == null));
  const errored = new Set<number>();
  for (const err of parsed.errors) {
    if (err.row === undefined || errored.has(err.row)) continue;
    const row = rows[err.row];
    if (isBlank(row)) continue;
    errored.add(err.row);
    structural.push({
      line: err.row + 2,
      kind: "invalid",
      gatewayRef: typeof row?.gateway_ref === "string" && row.gateway_ref.trim() ? row.gateway_ref.trim().toUpperCase() : null,
      reason: err.code === "TooManyFields" ? "Row has more fields than the header." : err.code === "TooFewFields" ? "Row has fewer fields than the header." : err.message,
    });
  }
  const cleanRows = rows.map((r, i) => {
    if (errored.has(i)) return {};
    // Papaparse puts overflow fields under __parsed_extra; drop it so it never looks like data.
    const { __parsed_extra: _extra, ...rest } = r as RawRow & { __parsed_extra?: unknown };
    return rest;
  });
  return { ok: true, rows: cleanRows, structural };
}

/** Parse + validate + match in one step. */
export function reconcileCsv(text: string, system: SystemPayment[]): ({ ok: true } & ReconcileResult) | Extract<ParsedCsv, { ok: false }> {
  const parsed = parseSettlementCsv(text);
  if (!parsed.ok) return parsed;
  const result = reconcile(parsed.rows, system, 2);
  const rejected = [...parsed.structural, ...result.rejected].sort((a, b) => a.line - b.line);
  return {
    ok: true,
    items: result.items,
    rejected,
    totals: { ...result.totals, rows: result.totals.rows + parsed.structural.length, rejected: rejected.length },
  };
}
