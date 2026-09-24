import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { ApiError } from "@/lib/api/errors";
import { handle } from "@/lib/api/handler";
import { requireRole } from "@/lib/auth/session";
import { db, run, rpc } from "@/lib/data/db";
import { getReconRun, listReconRuns, systemPaymentsForRecon } from "@/lib/data/reconciliation";
import { MAX_FILE_BYTES, reconcileCsv } from "@/lib/domain/settlement-csv";

// GET /api/reconciliation  previous runs, newest first
export const GET = handle(async () => {
  await requireRole("reconciliation.run");
  return listReconRuns();
});

// POST /api/reconciliation  multipart form with `file` (or a raw text/csv body)
// Parses and validates the settlement file, matches it against our payments with the pure
// reconcile() function, and stores the run and its items in one transaction.
export const POST = handle(async (req) => {
  const role = await requireRole("reconciliation.run");

  let text: string;
  let fileName = "settlement.csv";
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData().catch(() => {
      throw new ApiError(400, "invalid_upload", "Could not read the upload. Try again.");
    });
    const file = form.get("file");
    if (!(file instanceof File)) throw new ApiError(422, "file_required", "Choose a CSV file to upload.", "file");
    if (file.size > MAX_FILE_BYTES) throw new ApiError(413, "file_too_large", "The file is larger than 1 MB. Split it and upload each part.", "file");
    if (!/\.csv$/i.test(file.name) && !/csv|text\/plain|excel/.test(file.type)) {
      throw new ApiError(422, "not_csv", "Upload a .csv file exported from the gateway dashboard.", "file");
    }
    fileName = file.name;
    text = await file.text();
  } else {
    text = await req.text();
    if (text.length > MAX_FILE_BYTES) throw new ApiError(413, "file_too_large", "The file is larger than 1 MB.");
  }

  const result = reconcileCsv(text, await systemPaymentsForRecon());
  if (!result.ok) throw new ApiError(422, result.code, result.message, "file");

  // The same file uploaded again still gets its own run (the data may have changed since),
  // but the response says so, and resolving an item twice is safe in resolve_recon_item().
  const fileHash = createHash("sha256").update(text).digest("hex");
  const previous = await run<{ id: string; created_at: string }[]>(
    db().from("reconciliation_runs").select("id, created_at").eq("totals->>fileHash", fileHash).order("created_at", { ascending: false }).limit(1),
  );

  const runId = await rpc<string>("create_recon_run", {
    p_file_name: fileName,
    p_actor: role,
    p_row_count: result.totals.rows,
    p_totals: { ...result.totals, fileHash },
    p_rejected: result.rejected,
    p_items: result.items.map((i) => ({
      bucket: i.bucket,
      gateway_ref: i.gatewayRef,
      file_amount_paise: i.fileAmountPaise,
      file_status: i.fileStatus,
      settled_at: i.settledAt,
      system_amount_paise: i.systemAmountPaise,
      system_status: i.systemStatus,
      payment_id: i.paymentId,
    })),
  });

  const detail = await getReconRun(runId);
  return NextResponse.json(
    { data: { ...detail, duplicateOf: previous[0] ? { runId: previous[0].id, createdAt: previous[0].created_at } : null } },
    { status: 201 },
  );
});
