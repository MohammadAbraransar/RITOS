import { test, expect } from "@playwright/test";
import path from "path";
import fs from "fs";

test.describe("ShopFlow End-to-End Demo Flows (docs/04 §6)", () => {
  test.beforeAll(async () => {
    // Ensure test uploads directory and a sample image file exist for upload test
    const dummyImgPath = path.join(process.cwd(), "scratch", "test-damage.png");
    const scratchDir = path.dirname(dummyImgPath);
    if (!fs.existsSync(scratchDir)) {
      fs.mkdirSync(scratchDir, { recursive: true });
    }
    if (!fs.existsSync(dummyImgPath)) {
      // 1x1 png base64
      const pngBuffer = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
      fs.writeFileSync(dummyImgPath, pngBuffer);
    }
  });

  test("Happy Path: Buy headphones -> delivery simulated -> customer refund -> auto-approved -> executed", async ({ page, request }) => {
    // 1. Log in as aarav@example.com
    await page.goto("/login");
    await page.fill('input[type="email"]', "aarav@example.com");
    await page.fill('input[type="password"]', "Demo@1234");
    await page.click('button[type="submit"]');

    // Should redirect to /products or home
    await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 10000 });

    // 2. Buy Nimbus Wireless Headphones (PROD-001) by UPI
    await page.goto("/products/PROD-001");
    // Click Add to Cart
    await page.click('button:has-text("Add to Cart")');
    await expect(page.locator('text=Added to Cart!')).toBeVisible({ timeout: 5000 });

    // Go to checkout
    await page.goto("/checkout");
    await page.waitForSelector('text=Payment Method');

    // Ensure submit button is clicked
    const placeOrderBtn = page.locator('button[type="submit"]');
    await expect(placeOrderBtn).toBeEnabled();
    await placeOrderBtn.click();

    // Redirects to order confirmation or detail page: /orders/[orderId]/confirmation or /orders/[orderId]
    await page.waitForURL(/\/orders\/[^\/]+/, { timeout: 15000 });
    const url = page.url();
    const orderIdMatch = url.match(/\/orders\/([^\/]+)/);
    expect(orderIdMatch).not.toBeNull();
    const orderId = orderIdMatch![1].replace("/confirmation", "");

    // 3. Admin simulates delivery 4 days ago
    const adminLoginRes = await request.post("/api/auth/login", {
      data: { email: "admin@shopflow.test", password: "Demo@1234" },
    });
    expect(adminLoginRes.ok()).toBeTruthy();

    const simRes = await request.post(`/api/admin/orders/${orderId}/simulate-delivery`, {
      data: { days_ago: 4 },
    });
    expect(simRes.ok()).toBeTruthy();

    // 4. Customer opens order and clicks Request Refund
    await page.goto(`/orders/${orderId}`);
    await expect(page.locator("text=Delivered 4 days ago")).toBeVisible();

    const requestRefundLink = page.locator('a:has-text("Request Refund")');
    await expect(requestRefundLink).toBeVisible();
    await requestRefundLink.click();

    // 5. On refund form: pick "Product damaged", upload evidence, submit
    await page.waitForURL(`/orders/${orderId}/refund`);
    await page.selectOption("#refund-reason", "PRODUCT_DAMAGED");
    await page.selectOption("#refund-action", "FULL_REFUND");
    await page.fill("#refund-description", "Left ear cup arrived cracked.");

    const dummyImgPath = path.join(process.cwd(), "scratch", "test-damage.png");
    await page.setInputFiles("#evidence-upload", dummyImgPath);

    await page.click("#submit-refund-btn");

    // 6. Ticket is created with PENDING_RITOS and redirects to /refunds/[ticketId]
    await page.waitForURL(/\/refunds\/[^\/]+/, { timeout: 15000 });
    const ticketUrl = page.url();
    const ticketIdMatch = ticketUrl.match(/\/refunds\/([^\/]+)/);
    expect(ticketIdMatch).not.toBeNull();
    const ticketId = ticketIdMatch![1];
    expect(ticketId).toMatch(/^RIT-\d{4}-\d{6}$/);

    // 7. Dispatch outbox event -> Mock RITOS processes context & posts decision -> executes refund
    const outboxRes = await request.post("/api/admin/outbox/process");
    expect(outboxRes.ok()).toBeTruthy();

    // 8. Poll/reload ticket page until reached REFUNDED
    await expect(async () => {
      await page.reload();
      await expect(page.locator("text=REFUNDED")).toBeVisible({ timeout: 4000 });
    }).toPass({ timeout: 15000, intervals: [1500, 2500] });

    // Assert customer sees friendly approved state
    await expect(page.locator("text=Refund approved").first()).toBeVisible();
    await expect(page.locator("text=2,999 refund initiated")).toBeVisible();
    await expect(page.locator("text=Expected credit: 2-5 business days")).toBeVisible();

    // Non-negotiable security invariant: customers NEVER see risk/confidence/trace internals
    const pageText = await page.innerText("body");
    expect(pageText).not.toContain("confidence_score");
    expect(pageText).not.toContain("risk_metadata");
    expect(pageText).not.toContain("agent_trace");
    expect(pageText).not.toContain("0.96"); // confidence
  });

  test("Exception Path: Scenario 6 high-value smartphone hold -> support analyst inspects dossier -> approves modified amount -> executed", async ({ page, request }) => {
    // 1. Scenario 6 seeded ticket RIT-2026-000110
    // Ensure outbox event for RIT-2026-000110 is processed into HUMAN_REVIEW
    await request.post("/api/auth/login", {
      data: { email: "admin@shopflow.test", password: "Demo@1234" },
    });
    await request.post("/api/admin/demo/reset-and-seed");
    await request.post("/api/admin/outbox/process");

    // 2. Log in as support analyst
    await page.goto("/login");
    await page.fill('input[type="email"]', "support@shopflow.test");
    await page.fill('input[type="password"]', "Demo@1234");
    await page.click('button[type="submit"]');

    await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 10000 });

    // 3. Navigate to /admin/review
    await page.goto("/admin/review");
    await expect(page.locator("h1:has-text('Escalated Tickets')")).toBeVisible();

    // 4. Locate and click on ticket RIT-2026-000110
    await page.goto("/admin/review/RIT-2026-000110");

    // 5. Support analyst inspects dossier: sees claim details, orchestration analysis, RITOS decision
    await expect(page.locator("text=RIT-2026-000110")).toBeVisible();
    await expect(page.locator("text=RITOS Orchestration Analysis")).toBeVisible();
    await expect(page.locator("text=Adjudication Controls")).toBeVisible();

    // 6. Enter review note and modified amount
    await page.fill('textarea[placeholder*="rationale"]', "Approved partial compensation after physical inspection of unit.");
    await page.fill('input[type="number"]', "2000000"); // 20,000 INR in paise

    // Click "Approve Modified"
    const modifyBtn = page.locator('button:has-text("Approve Modified")');
    await expect(modifyBtn).toBeEnabled();
    await modifyBtn.click();

    // 7. Success message displayed
    await expect(page.locator("text=Decision applied").or(page.locator("text=Decision applied: MODIFY"))).toBeVisible({ timeout: 8000 });

    // 8. Verify ticket is executed and status reflects resolution
    await expect(page.locator("text=PARTIALLY_APPROVED").or(page.locator("text=REFUNDED"))).toBeVisible();
  });
});
