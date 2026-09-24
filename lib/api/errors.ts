// One error shape for every API response: { error: { code, message, field? } }.
// Database functions raise with a machine code in HINT (see 002_functions.sql); this maps
// those codes, and raw Postgres/PostgREST errors, to an HTTP status and a readable message.

import { NextResponse } from "next/server";
import { ZodError } from "zod";

export type ApiErrorBody = { error: { code: string; message: string; field?: string } };

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly field?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const HINT_STATUS: Record<string, number> = {
  forbidden: 403,
  student_not_found: 404,
  payment_not_found: 404,
  installment_not_found: 404,
  recon_item_not_found: 404,
  invalid_actor: 400,
  invalid_amount: 422,
  amount_too_large: 422,
  invalid_mode: 422,
  invalid_simulate: 422,
  idempotency_key_required: 422,
  reason_required: 422,
  approver_required: 422,
  note_required: 422,
  invalid_resolution: 422,
  concession_exceeds_remaining: 422,
  idempotency_conflict: 409,
  payment_already_success: 409,
  payment_already_failed: 409,
  payment_already_reversed: 409,
  payment_failed: 409,
  payment_not_success: 409,
  payment_not_pending: 409,
  illegal_transition: 409,
  recon_item_already_resolved: 409,
  recon_item_matched: 409,
  append_only: 409,
  payment_immutable: 409,
};

// Which form field a validation error belongs to, so the UI can show it inline.
const HINT_FIELD: Record<string, string> = {
  invalid_amount: "amountPaise",
  amount_too_large: "amountPaise",
  concession_exceeds_remaining: "amountPaise",
  invalid_mode: "mode",
  invalid_simulate: "simulate",
  reason_required: "reason",
  approver_required: "approvedBy",
  note_required: "note",
};

export type PgLikeError = { code?: string; message?: string; hint?: string | null; details?: string | null };

/** Converts a Supabase/PostgREST error into an ApiError. */
export function fromDbError(err: PgLikeError): ApiError {
  const hint = err.hint ?? "";
  if (hint && hint in HINT_STATUS) {
    return new ApiError(HINT_STATUS[hint]!, hint, err.message ?? "Request failed.", HINT_FIELD[hint]);
  }
  switch (err.code) {
    case "23505":
      return new ApiError(409, "conflict", "This record already exists. Refresh and try again.");
    case "23514":
    case "23502":
      return new ApiError(422, "constraint_violation", "The database rejected these values. Check the form and try again.");
    case "23503":
      return new ApiError(422, "invalid_reference", "This refers to a record that does not exist.");
    case "22P02":
      return new ApiError(400, "invalid_id", "That id is not valid.");
    case "40001":
    case "40P01":
      return new ApiError(503, "busy", "Another change to this student was in progress. Try again.");
    case "PGRST116":
      return new ApiError(404, "not_found", "Not found.");
    case "42501":
      return new ApiError(500, "db_permission", "The server is not allowed to do that. Check the database grants.");
  }
  if (err.message?.includes("fetch failed")) {
    return new ApiError(503, "db_unreachable", "Cannot reach the database right now. Try again in a moment.");
  }
  return new ApiError(500, "db_error", "Something went wrong in the database. The change was not saved.");
}

export function errorResponse(err: unknown): NextResponse<ApiErrorBody> {
  if (err instanceof ApiError) {
    return NextResponse.json(
      { error: { code: err.code, message: err.message, ...(err.field ? { field: err.field } : {}) } },
      { status: err.status },
    );
  }
  if (err instanceof ZodError) {
    const issue = err.issues[0];
    const field = issue?.path.join(".") || undefined;
    return NextResponse.json(
      { error: { code: "validation_error", message: issue?.message ?? "Invalid input.", ...(field ? { field } : {}) } },
      { status: 422 },
    );
  }
  console.error("Unhandled API error", err);
  return NextResponse.json(
    { error: { code: "internal_error", message: "Something went wrong on the server. Nothing was changed." } },
    { status: 500 },
  );
}
