// Captures fresh 1440px screenshots of the key screens for the PDF documentation.
// Needs the app running (npm run dev or npm start). Resets demo data first so every run shows
// the same story, performs a few actions so the screens have something to show, and resets
// again at the end.
//
//   node scripts/screenshots.ts          (BASE_URL defaults to http://localhost:3000)

import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "@playwright/test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "docs", "assets", "doc");
const base = process.env.BASE_URL ?? "http://localhost:3000";

async function ensureRunning() {
  try {
    const res = await fetch(`${base}/api/role`);
    if (!res.ok) throw new Error(String(res.status));
  } catch {
    console.error(`The app is not reachable at ${base}. Start it with "npm run dev" (or set BASE_URL) and try again.`);
    process.exit(1);
  }
}

async function api(path: string, init: RequestInit = {}) {
  const res = await fetch(base + path, { ...init, headers: { cookie: "kosha_role=admin", ...(init.headers ?? {}) } });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
  return (await res.json()).data;
}

async function shot(page: Page, name: string, opts: { fullPage?: boolean; clipHeight?: number } = {}) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(250);
  const file = join(out, `${name}.png`);
  if (opts.clipHeight) await page.screenshot({ path: file, clip: { x: 0, y: 0, width: 1440, height: opts.clipHeight } });
  else await page.screenshot({ path: file, fullPage: opts.fullPage ?? false });
  console.log(`saved docs/assets/doc/${name}.png`);
}

await ensureRunning();
mkdirSync(out, { recursive: true });
await api("/api/demo/reset", { method: "POST" });

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5, reducedMotion: "reduce" });
await context.addInitScript(() => window.localStorage.setItem("kosha.demoGuideSeen", "1"));
await context.addCookies([{ name: "kosha_role", value: "admin", url: base }]);
const page = await context.newPage();
const go = (path: string) => page.goto(base + path, { waitUntil: "networkidle" });

try {
  // Reconciliation first, so the dashboard shows open items afterwards.
  await go("/reconciliation");
  await page.locator("#settlement-file").setInputFiles(join(root, "public", "samples", "settlement_sample.csv"));
  await page.getByRole("button", { name: "Run reconciliation" }).click();
  await page.waitForURL(/\/reconciliation\/[0-9a-f-]{36}/);
  await page.waitForLoadState("networkidle");
  await page.getByRole("tab", { name: /Amount mismatch/ }).click();
  await shot(page, "reconciliation-run", { clipHeight: 640 });

  await go("/");
  await page.locator(".recharts-surface").first().waitFor();
  await shot(page, "dashboard");

  await go("/students?status=OVERDUE");
  await shot(page, "students");

  await go("/students/CSE24-003");
  await shot(page, "statement", { fullPage: true });

  await go("/students/CSE24-001");
  await page.getByRole("button", { name: "Record payment" }).first().click();
  await page.getByLabel("Amount").fill("30000");
  await page.getByText("UPI", { exact: true }).click();
  await shot(page, "record-payment");
  await page.keyboard.press("Escape");

  const arjun = await api("/api/payments?q=CSE24-003");
  const returned = arjun.find((p: { receiptNo: string | null }) => p.receiptNo?.endsWith("000005"));
  await go(`/payments/${returned.id}`);
  await shot(page, "payment-detail", { fullPage: true });

  const karthik = await api("/api/payments?q=BCOM25-002");
  await go(`/payments/${karthik[0].id}/receipt`);
  await shot(page, "receipt", { clipHeight: 1000 });

  await go("/audit");
  await shot(page, "audit", { clipHeight: 620 });
} finally {
  await browser.close();
  await api("/api/demo/reset", { method: "POST" });
}
