import { prisma } from "@/server/db";
import { processOutboxBatch } from "@/server/outbox/processor";
import { settleDueRefunds } from "@/server/services/settlement.service";
import { config } from "@/server/config";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    if (!process.env.DATABASE_URL) {
      console.warn("[ShopFlow] DATABASE_URL is not set (create shopflow/.env from .env.example); outbox poller disabled.");
      return;
    }
    console.log("[ShopFlow] Initializing instrumentation and outbox poller...");
    let lastError = "";
    let running = false;
    setInterval(async () => {
      // Never start a batch while the previous one is still in flight (prevents double delivery)
      if (running) return;
      running = true;
      try {
        const results = await processOutboxBatch();
        // Complete refunds the payment provider has settled, whether or not anyone is looking at them
        const settled = await settleDueRefunds(config.outbox.batchSize);
        if (settled) console.log(`[ShopFlow settlement] ${settled} refund(s) settled`);
        for (const r of results) {
          if (r.error) console.warn(`[ShopFlow outbox] ${r.id} ${r.status}: ${r.error}`);
        }
        lastError = "";
      } catch (err: any) {
        // Log each distinct failure once (e.g. DATABASE_URL missing) instead of on every poll
        const msg = err?.message?.split("\n").filter(Boolean).pop() || String(err);
        if (msg !== lastError) console.error(`[ShopFlow outbox] poller failed: ${msg}`);
        lastError = msg;
      } finally {
        running = false;
      }
    }, config.outbox.pollIntervalMs);
  }
}
