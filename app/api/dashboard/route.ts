import { handle } from "@/lib/api/handler";
import { requireRole } from "@/lib/auth/session";
import { getDashboard } from "@/lib/data/dashboard";

// GET /api/dashboard  summary strip, 30-day trend, overdue by course, needs-attention lists
export const GET = handle(async () => {
  await requireRole("dashboard.view");
  return getDashboard();
});
