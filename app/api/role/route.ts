import { NextResponse } from "next/server";
import { handle, jsonBody } from "@/lib/api/handler";
import { roleSchema } from "@/lib/api/schemas";
import { ROLE_COOKIE } from "@/lib/auth/permissions";
import { getRole } from "@/lib/auth/session";

// GET: the current simulated role. POST { role }: switch role (sets the kosha_role cookie).
export const GET = handle(async () => ({ role: await getRole() }));

export const POST = handle(async (req) => {
  const { role } = roleSchema.parse(await jsonBody(req));
  const res = NextResponse.json({ data: { role } });
  res.cookies.set(ROLE_COOKIE, role, { path: "/", sameSite: "lax", httpOnly: false, maxAge: 60 * 60 * 24 * 30 });
  return res;
});
