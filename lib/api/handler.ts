import { NextResponse, type NextRequest } from "next/server";
import { ApiError, errorResponse } from "@/lib/api/errors";

type Ctx<P> = { params: Promise<P> };

/** Wraps a route handler: returns { data } on success and the standard error shape on failure. */
export function handle<P = Record<string, never>>(fn: (req: NextRequest, params: P) => Promise<unknown>) {
  return async (req: NextRequest, ctx: Ctx<P>) => {
    try {
      const params = ctx?.params ? await ctx.params : ({} as P);
      const data = await fn(req, params);
      if (data instanceof NextResponse) return data;
      return NextResponse.json({ data });
    } catch (err) {
      return errorResponse(err);
    }
  };
}

/** Reads a JSON body, turning a malformed body into a 400 instead of a crash. */
export async function jsonBody(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new ApiError(400, "invalid_json", "The request body must be valid JSON.");
  }
}
