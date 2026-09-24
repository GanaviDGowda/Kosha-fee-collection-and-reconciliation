// Design self-review: captures screens at 1440px and 390px into docs/assets/screens/.
// Needs the app running (npm run dev). Usage:
//   node scripts/review-shots.ts                 all screens
//   node scripts/review-shots.ts statement-arjun  only names containing that text
// Options via env: BASE_URL (default http://localhost:3000).

import { mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "@playwright/test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "docs", "assets", "screens");
const base = process.env.BASE_URL ?? "http://localhost:3000";

type Shot = { name: string; path: string; role?: "admin" | "accountant" | "student"; before?: (page: Page) => Promise<void>; fullPage?: boolean };

const SHOTS: Shot[] = [
  { name: "dashboard", path: "/", before: async (page) => void (await page.locator(".recharts-surface").first().waitFor()) },
  { name: "reconciliation", path: "/reconciliation" },
  { name: "audit", path: "/audit" },
  { name: "payments", path: "/payments" },
  { name: "students", path: "/students" },
  { name: "students-filtered", path: "/students?status=OVERDUE&course=BCA" },
  { name: "students-empty", path: "/students?q=zzzz" },
  { name: "statement-arjun-reversed", path: "/students/CSE24-003" },
  { name: "statement-priya-concession", path: "/students/CSE25-002" },
  { name: "statement-karthik-advance", path: "/students/BCOM25-002" },
  { name: "statement-sneha-pending", path: "/students/BCA26-002" },
  { name: "statement-ananya-paid", path: "/students/BCA25-001" },
  { name: "statement-vikram-installments", path: "/students/BCOM26-001?tab=installments" },
  { name: "statement-rohan-payments", path: "/students/CSE24-001?tab=payments" },
  { name: "statement-student-role", path: "/students/BCA26-002", role: "student" },
  {
    name: "command-palette",
    path: "/students",
    fullPage: false,
    before: async (page) => {
      await page.keyboard.press("Control+k");
      await page.getByRole("combobox").fill("kul");
      await page.getByRole("option").first().waitFor();
    },
  },
  {
    name: "demo-guide",
    path: "/students",
    fullPage: false,
    before: async (page) => {
      await page.getByRole("button", { name: /demo guide/i }).click();
      await page.waitForTimeout(400);
    },
  },
];

const filter = process.argv[2];
const widths = [
  { label: "1440", width: 1440, height: 900 },
  { label: "390", width: 390, height: 844 },
];

mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
try {
  for (const shot of SHOTS.filter((s) => !filter || s.name.includes(filter))) {
    for (const w of widths) {
      const context = await browser.newContext({ viewport: { width: w.width, height: w.height }, deviceScaleFactor: 1, reducedMotion: "reduce" });
      await context.addCookies([{ name: "kosha_role", value: shot.role ?? "admin", url: base }]);
      // The demo guide opens itself on a first visit; mark it seen so it doesn't cover the page.
      await context.addInitScript(() => window.localStorage.setItem("kosha.demoGuideSeen", "1"));
      const page = await context.newPage();
      await page.goto(base + shot.path, { waitUntil: "networkidle" });
      await page.evaluate(() => document.fonts.ready);
      if (shot.before) await shot.before(page);
      const file = join(out, `${shot.name}-${w.label}.png`);
      await page.screenshot({ path: file, fullPage: shot.fullPage ?? true });
      console.log(`saved ${file.replace(root, ".")}`);
      await context.close();
    }
  }
} finally {
  await browser.close();
}
