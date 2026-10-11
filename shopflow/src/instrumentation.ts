import { prisma } from "@/server/db";
import { processOutboxBatch } from "@/server/outbox/processor";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    console.log("[ShopFlow] Initializing instrumentation and outbox poller...");
    setInterval(async () => {
      try {
        await processOutboxBatch(5);
      } catch (err) {
        // Poller error logged silently in background
      }
    }, 5000);
  }
}
