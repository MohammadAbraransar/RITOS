/**
 * ShopFlow server configuration: the only place server code reads environment variables.
 *
 * Secrets and service URLs are required and have no fallback: a missing value fails loudly when first used,
 * instead of silently using a publicly known default. Tunables (timeouts, retry limits) have documented
 * defaults here and in .env.example. Values are read lazily so `next build` does not need runtime secrets.
 */

import { STORE_LOCALE } from "@/lib/money";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not set; add it to shopflow/.env (see .env.example)`);
  return value;
}

function integer(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value < 0) throw new Error(`${name} must be a non-negative integer, got "${raw}"`);
  return value;
}

function flag(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  return raw === "true" || raw === "1" || raw === "yes";
}

const withoutTrailingSlash = (url: string) => url.replace(/\/+$/, "");

export const config = {
  /** RITOS API root, e.g. http://127.0.0.1:8000 */
  get ritosBaseUrl() {
    return withoutTrailingSlash(required("RITOS_BASE_URL"));
  },
  /** Shared key both directions: ShopFlow → RITOS calls and RITOS → ShopFlow callbacks. */
  get ritosApiKey() {
    return required("RITOS_API_KEY");
  },
  /** How long ShopFlow waits for RITOS to adjudicate one claim (the pipeline runs synchronously). */
  get ritosRequestTimeoutMs() {
    return integer("RITOS_REQUEST_TIMEOUT_MS", 30_000);
  },
  /** Public URL of this store; used in links RITOS follows back (context, evidence downloads). */
  get storeBaseUrl() {
    return withoutTrailingSlash(required("SHOPFLOW_BASE_URL"));
  },
  /** true = decide refunds with the built-in mock instead of RITOS (offline development only). */
  get mockRitos() {
    return flag("MOCK_RITOS", false);
  },
  /** Storefront "test claim" panel: sends claims that do not exist in the store DB. Off in production. */
  get demoClaimsEnabled() {
    return flag("DEMO_CLAIMS_ENABLED", false);
  },
  get sessionSecret() {
    const secret = required("SESSION_SECRET");
    if (secret.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters");
    return secret;
  },
  get sessionTtlHours() {
    return integer("SESSION_TTL_HOURS", 24 * 7);
  },
  /** Which system executes approved refunds: "shopflow" (this store) or "ritos". */
  get executionOwner() {
    return (process.env.EXECUTION_OWNER?.trim() || "shopflow").toLowerCase();
  },
  /** Private directory for customer evidence uploads (never served statically). */
  get uploadDir() {
    return process.env.UPLOAD_DIR?.trim() || `${process.cwd()}/uploads`;
  },
  /** Locale for customer-facing money formatting; same source as the browser (src/lib/money.ts). */
  get storeLocale() {
    return STORE_LOCALE;
  },
  /** Customer-facing credit time quoted for refunds (e.g. "2-5 business days"); null = quote nothing. */
  get refundCreditEstimate(): string | null {
    return process.env.REFUND_CREDIT_ESTIMATE?.trim() || null;
  },
  /** Mock payment provider: delay before a refund settles. */
  get mockSettleMs() {
    return integer("MOCK_SETTLE_MS", 3_000);
  },
  /** Interactive DB transaction limits; a remote database (WAN round-trips) needs more than Prisma's 5s default. */
  get dbTransactionTimeoutMs() {
    return integer("DB_TRANSACTION_TIMEOUT_MS", 20_000);
  },
  get dbTransactionMaxWaitMs() {
    return integer("DB_TRANSACTION_MAX_WAIT_MS", 10_000);
  },
  outbox: {
    get pollIntervalMs() {
      return integer("OUTBOX_POLL_MS", 5_000);
    },
    get batchSize() {
      return integer("OUTBOX_BATCH_SIZE", 10);
    },
    /** Attempts before an event is marked FAILED (an operator can retry it). */
    get maxAttempts() {
      return integer("OUTBOX_MAX_ATTEMPTS", 6);
    },
    get baseBackoffMs() {
      return integer("OUTBOX_BASE_BACKOFF_MS", 2_000);
    },
    get maxBackoffMs() {
      return integer("OUTBOX_MAX_BACKOFF_MS", 300_000);
    },
  },
};
