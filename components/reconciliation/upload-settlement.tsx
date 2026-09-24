"use client";

// Drag-and-drop (or pick) a gateway settlement CSV. The server parses, validates, matches and
// stores the run; we then open the run's result page.

import { AlertCircle, Download, FileSpreadsheet, UploadCloud, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";

const MAX_BYTES = 1_000_000;

export function UploadSettlement() {
  const router = useRouter();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function choose(f: File | undefined) {
    setError(null);
    if (!f) return;
    if (!/\.csv$/i.test(f.name)) return setError(`${f.name} is not a .csv file. Export the settlement report from the gateway as CSV.`);
    if (f.size > MAX_BYTES) return setError("The file is larger than 1 MB. Split it and upload each part.");
    if (f.size === 0) return setError("The file is empty.");
    setFile(f);
  }

  async function upload() {
    if (!file || uploading) return;
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/reconciliation", { method: "POST", body: form });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.data) {
        setError(json?.error?.message ?? `Upload failed (${res.status}). Nothing was saved. Try again.`);
        return;
      }
      const run = json.data as { id: string; openCount: number; duplicateOf: { runId: string } | null };
      toast.success(
        "Reconciliation complete",
        run.openCount === 0 ? "Everything matched." : `${run.openCount} ${run.openCount === 1 ? "item needs" : "items need"} review.`,
      );
      router.push(`/reconciliation/${run.id}`);
    } catch {
      setError("Could not reach the server. Nothing was saved. Try again.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-3">
      <label
        htmlFor="settlement-file"
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          choose(e.dataTransfer.files[0]);
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center rounded-panel border border-dashed border-line-strong bg-canvas/50 px-6 py-8 text-center transition-colors hover:border-accent/60 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent",
          dragging && "border-accent bg-accent/5",
        )}
      >
        <UploadCloud className="size-6 text-muted" aria-hidden />
        <span className="mt-2 font-medium">Drop the settlement CSV here, or choose a file</span>
        <span className="mt-1 text-sm text-muted">Columns: gateway_ref, amount_inr, status, settled_at. Up to 1 MB.</span>
        <input
          ref={input}
          id="settlement-file"
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          onChange={(e) => {
            choose(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </label>

      {file ? (
        <div className="flex flex-wrap items-center gap-3 rounded border border-line px-3.5 py-2.5">
          <FileSpreadsheet className="size-4 text-muted" aria-hidden />
          <span className="min-w-0 flex-1 truncate font-medium">{file.name}</span>
          <span className="figure text-sm text-muted">{(file.size / 1024).toFixed(1)} KB</span>
          <button className="rounded p-1 text-muted hover:text-ink" onClick={() => setFile(null)} aria-label="Remove file" disabled={uploading}>
            <X className="size-4" />
          </button>
          <Button onClick={upload} loading={uploading}>
            {uploading ? "Reconciling" : "Run reconciliation"}
          </Button>
        </div>
      ) : null}

      {error ? (
        <div role="alert" className="flex gap-2.5 rounded tint-debit px-3.5 py-3 text-sm">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p className="text-ink">{error}</p>
        </div>
      ) : null}

      <a href="/samples/settlement_sample.csv" download className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline">
        <Download className="size-4" aria-hidden />
        Download sample file
      </a>
    </div>
  );
}
