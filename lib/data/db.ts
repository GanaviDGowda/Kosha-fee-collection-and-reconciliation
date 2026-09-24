// Thin helpers over the service-role Supabase client: run a query or an rpc and turn any
// database error into an ApiError with a readable message.

import { ApiError, fromDbError, type PgLikeError } from "@/lib/api/errors";
import { supabaseAdmin } from "@/lib/supabase/server";

// Without generated DB types supabase-js can't infer row shapes (it guesses embedded
// relations are arrays), so each query declares its row type at the call site instead.
type QueryResult = { data: unknown; error: PgLikeError | null };

export function db() {
  return supabaseAdmin();
}

/** Awaits a Supabase query builder, throwing a mapped ApiError on failure. */
export async function run<T>(query: PromiseLike<QueryResult>): Promise<T> {
  const { data, error } = await query;
  if (error) throw fromDbError(error);
  return data as T;
}

/** Same as run(), but a missing row becomes a 404 with the given message. */
export async function runSingle<T>(query: PromiseLike<QueryResult>, notFound: string): Promise<T> {
  const data = await run<T | null>(query);
  if (data === null || data === undefined) throw new ApiError(404, "not_found", notFound);
  return data;
}

/** Calls a money function (one transaction in Postgres). */
export async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabaseAdmin().rpc(fn, args);
  if (error) throw fromDbError(error);
  return data as T;
}
