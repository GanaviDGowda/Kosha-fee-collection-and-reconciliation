// End-to-end smoke tests: the three flows that matter most, driven through the real UI.
//   1. Record a payment (cash) and see the statement and balance update.
//   2. An online payment times out, then a settlement file resolves it through reconciliation.
//   3. An admin reverses a payment and the installment reopens.

import { expect, test, type Page } from "@playwright/test";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";

/** The role switcher just sets this cookie; tests set it directly. */
async function asRole(page: Page, role: "admin" | "accountant" | "student") {
  await page.context().addCookies([{ name: "kosha_role", value: role, url: BASE }]);
}

async function resetDemo(page: Page) {
  const res = await page.request.post("/api/demo/reset", { headers: { cookie: "kosha_role=admin" } });
  expect(res.ok(), "demo reset").toBeTruthy();
}

async function balanceText(page: Page) {
  return (await page.getByTestId("balance").innerText()).trim();
}

test.beforeEach(async ({ page, context, baseURL }) => {
  // Keep the first-visit demo guide from covering the page.
  await context.addInitScript(() => window.localStorage.setItem("kosha.demoGuideSeen", "1"));
  await context.addCookies([{ name: "kosha_role", value: "admin", url: baseURL! }]);
  await resetDemo(page);
});

test.afterAll(async ({ request }) => {
  await request.post("/api/demo/reset", { headers: { cookie: "kosha_role=admin" } });
});

test("record a cash payment: allocation preview, receipt, statement and balance update", async ({ page }) => {
  await page.goto("/students/BCOM26-001");
  await expect(page.getByRole("heading", { name: "Vikram Singh" })).toBeVisible();
  expect(await balanceText(page)).toBe("₹62,000.00");

  await page.getByRole("button", { name: "Record payment" }).first().click();
  const drawer = page.getByRole("dialog", { name: "Record payment" });
  await expect(drawer.getByLabel("Amount")).toHaveValue("29000"); // prefilled with the overdue amount
  await expect(drawer.getByLabel("Allocation preview")).toContainText("₹29,000 will clear Tuition Term 1 (₹28,000) and Library Term 1 (₹1,000).");

  // Validation: too many decimals blocks submit.
  await drawer.getByLabel("Amount").fill("100.555");
  await expect(drawer.getByText("Use at most 2 decimal places.")).toBeVisible();
  await expect(drawer.getByRole("button", { name: "Record payment" })).toBeDisabled();

  await drawer.getByLabel("Amount").fill("29000");
  await drawer.getByRole("button", { name: "Record payment" }).click();

  await expect(page.getByRole("status")).toContainText("Payment recorded");
  await expect(drawer).toBeHidden();
  await expect.poll(() => balanceText(page)).toBe("₹33,000.00");
  const newRow = page.locator('tr[data-highlight="true"]');
  await expect(newRow).toContainText("Payment received, Cash");
  await expect(newRow).toContainText(/KSH\/2026-27\/\d{6}/);

  // The installment it paid is now cleared.
  await page.getByRole("tab", { name: /Installments/ }).click();
  await expect(page.getByRole("row", { name: /Tuition Term 1/ })).toContainText("Paid");
});

test("an online payment times out, then reconciliation marks it as paid", async ({ page }) => {
  await page.goto("/students/BCOM26-001");
  await page.getByRole("button", { name: "Record payment" }).first().click();
  const drawer = page.getByRole("dialog", { name: "Record payment" });
  await drawer.getByLabel("Amount").fill("12500");
  await drawer.getByText("UPI", { exact: true }).click();
  await expect(drawer.getByText("Demo control: simulate gateway outcome")).toBeVisible();
  await drawer.getByText("Time out", { exact: true }).click();
  await drawer.getByRole("button", { name: "Record payment" }).click();

  await expect(page.getByRole("status")).toContainText("Payment pending");
  await expect(page).toHaveURL(/tab=payments/);
  const pendingRow = page.locator('tr[data-highlight="true"]');
  await expect(pendingRow).toContainText("Pending");
  const gatewayRef = (await pendingRow.locator("text=/MGW\\d+/").first().innerText()).trim();
  expect(await balanceText(page)).toBe("₹62,000.00"); // pending is not counted

  // The gateway's settlement file for today includes this payment.
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
  const csv = `gateway_ref,amount_inr,status,settled_at\n${gatewayRef},12500.00,SUCCESS,${today}T11:00:00+05:30\n`;

  await asRole(page, "accountant");
  await page.goto("/reconciliation");
  await page.locator("#settlement-file").setInputFiles({ name: "settlement_today.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await page.getByRole("button", { name: "Run reconciliation" }).click();
  await expect(page).toHaveURL(/\/reconciliation\/[0-9a-f-]{36}/);

  await expect(page.getByRole("tab", { name: /Settled but pending here/ })).toHaveAttribute("data-state", "active");
  const row = page.getByRole("row", { name: new RegExp(gatewayRef) });
  await row.getByRole("button", { name: "Mark as paid" }).click();
  const resolve = page.getByRole("dialog", { name: "Mark as paid" });
  await resolve.getByRole("button", { name: "Mark as paid" }).click();
  await expect(page.getByRole("status")).toContainText("Marked as paid");
  await expect(row).toContainText("Marked as paid by Accountant");

  // Back on the statement: the payment succeeded, has a receipt and counts towards the balance.
  await page.goto("/students/BCOM26-001?tab=payments");
  await expect(page.getByRole("row", { name: new RegExp(gatewayRef) })).toContainText("Success");
  expect(await balanceText(page)).toBe("₹49,500.00");
});

test("an admin reverses a payment and the installment reopens; an accountant cannot", async ({ page }) => {
  // Accountant: no reverse action offered.
  await asRole(page, "accountant");
  await page.goto("/students/BCA25-001?tab=payments");
  await page.getByRole("button", { name: /Actions for KSH\/2026-27\/000001/ }).click();
  await expect(page.getByRole("menuitem", { name: "Reverse payment" })).toHaveCount(0);
  await page.keyboard.press("Escape");

  // Admin reverses Ananya's term 1 bank transfer.
  await asRole(page, "admin");
  await page.goto("/students/BCA25-001?tab=payments");
  expect(await balanceText(page)).toBe("₹0.00");
  await page.getByRole("button", { name: /Actions for KSH\/2026-27\/000001/ }).click();
  await page.getByRole("menuitem", { name: "Reverse payment" }).click();

  const drawer = page.getByRole("dialog", { name: "Reverse payment" });
  await expect(drawer).toContainText("These installments reopen");
  await drawer.getByRole("button", { name: "Reverse payment" }).click();
  await expect(drawer.getByText(/Give a reason/)).toBeVisible(); // reason is required
  await drawer.getByLabel("Reason").fill("Cheque bounced: insufficient funds");
  await drawer.getByRole("button", { name: "Reverse payment" }).click();

  await expect(page.getByRole("status")).toContainText("Payment reversed");
  await expect.poll(() => balanceText(page)).toBe("₹41,500.00");
  await expect(page.getByRole("row", { name: /KSH\/2026-27\/000001/ })).toContainText("Reversed");

  // Statement keeps the original row (struck through) and adds the reversal.
  await page.getByRole("tab", { name: /Statement/ }).click();
  await expect(page.getByRole("link", { name: /Reversed on/ })).toBeVisible();
  await expect(page.getByRole("row", { name: /Payment reversed: Cheque bounced/ })).toBeVisible();
  await page.getByRole("tab", { name: /Installments/ }).click();
  await expect(page.getByRole("row", { name: /Tuition Term 1/ })).toContainText("Overdue");

  // The API refuses a second reversal.
  const paymentId = await page.request
    .get("/api/payments?q=KSH/2026-27/000001", { headers: { cookie: "kosha_role=admin" } })
    .then(async (r) => (await r.json()).data[0].id as string);
  const again = await page.request.post(`/api/payments/${paymentId}/reverse`, { headers: { cookie: "kosha_role=admin" }, data: { reason: "Second attempt" } });
  expect(again.status()).toBe(409);
  expect((await again.json()).error.message).toBe("This payment was already reversed.");
});
