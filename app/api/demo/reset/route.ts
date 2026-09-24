import { handle } from "@/lib/api/handler";
import { requireRole } from "@/lib/auth/session";
import { rpc } from "@/lib/data/db";

// POST /api/demo/reset  wipes and reseeds the demo data (admin only)
export const POST = handle(async () => {
  const role = await requireRole("demo.reset");
  return rpc<Record<string, number>>("reset_demo", { p_actor: role });
});
