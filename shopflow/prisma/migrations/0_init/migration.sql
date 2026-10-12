-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('CUSTOMER', 'SUPPORT_ANALYST', 'ADMIN');

-- CreateEnum
CREATE TYPE "PolicyType" AS ENUM ('FULL', 'FULL_HIGH_VALUE', 'PARTIAL', 'NON_REFUNDABLE', 'NON_REFUNDABLE_AFTER_OPEN', 'EXCHANGE_ONLY', 'DEFECTIVE_ONLY', 'FULL_SHORT_WINDOW');

-- CreateEnum
CREATE TYPE "ReturnShipping" AS ENUM ('FREE', 'CUSTOMER', 'NA');

-- CreateEnum
CREATE TYPE "VerificationType" AS ENUM ('NONE', 'IMEI', 'SERIAL');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('UPI', 'CARD', 'NETBANKING', 'COD');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PAID', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED');

-- CreateEnum
CREATE TYPE "TicketReason" AS ENUM ('PRODUCT_DAMAGED', 'PRODUCT_DEFECTIVE', 'WRONG_PRODUCT', 'MISSING_ITEM', 'NOT_AS_DESCRIBED', 'DUPLICATE_CHARGE', 'ORDER_NEVER_ARRIVED', 'LATE_DELIVERY', 'CHANGED_MIND', 'INCORRECT_QUANTITY', 'BILLING_ISSUE', 'OTHER');

-- CreateEnum
CREATE TYPE "RequestedAction" AS ENUM ('FULL_REFUND', 'PARTIAL_REFUND', 'REPLACEMENT', 'EXCHANGE', 'RETURN');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('PENDING_RITOS', 'PROCESSING', 'APPROVED', 'PARTIALLY_APPROVED', 'REJECTED', 'HUMAN_REVIEW', 'REFUND_INITIATED', 'REFUND_PROCESSING', 'REFUNDED', 'FAILED');

-- CreateEnum
CREATE TYPE "ApprovalSource" AS ENUM ('AUTO', 'HUMAN');

-- CreateEnum
CREATE TYPE "EvidenceType" AS ENUM ('IMAGE', 'DOCUMENT', 'SCREENSHOT');

-- CreateEnum
CREATE TYPE "DecisionType" AS ENUM ('APPROVED', 'PARTIALLY_APPROVED', 'REJECTED', 'HUMAN_REVIEW');

-- CreateEnum
CREATE TYPE "RefundTxStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCESS', 'FAILED');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'EMAIL_MOCK');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "ExchangeDirection" AS ENUM ('OUT', 'IN');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'CUSTOMER',
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "password_hash" TEXT NOT NULL,
    "risk_metadata" JSONB DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "session_token" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "specs" JSONB NOT NULL DEFAULT '{}',
    "price_minor" INTEGER NOT NULL,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "image_url" TEXT NOT NULL,
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 4.5,
    "is_digital" BOOLEAN NOT NULL DEFAULT false,
    "is_personalized" BOOLEAN NOT NULL DEFAULT false,
    "is_clearance" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refund_policies" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "policy_type" "PolicyType" NOT NULL,
    "refund_percentage" INTEGER NOT NULL DEFAULT 100,
    "return_window_days" INTEGER NOT NULL DEFAULT 30,
    "opened_allowed" BOOLEAN NOT NULL DEFAULT true,
    "requires_unused" BOOLEAN NOT NULL DEFAULT false,
    "defective_only" BOOLEAN NOT NULL DEFAULT false,
    "exchange_only" BOOLEAN NOT NULL DEFAULT false,
    "replacement_allowed" BOOLEAN NOT NULL DEFAULT true,
    "return_required" BOOLEAN NOT NULL DEFAULT true,
    "evidence_required_reasons" TEXT[],
    "human_approval_threshold_minor" INTEGER,
    "exceptions" JSONB NOT NULL DEFAULT '{}',
    "return_shipping" "ReturnShipping" NOT NULL DEFAULT 'FREE',
    "verification_required" "VerificationType" NOT NULL DEFAULT 'NONE',
    "notes" TEXT,

    CONSTRAINT "refund_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "total_minor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "shipping_address" JSONB NOT NULL,
    "ordered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "delivered_at" TIMESTAMP(3),
    "delivery_status" TEXT NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unit_price_minor" INTEGER NOT NULL,
    "unit_serial" TEXT,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "transaction_id" TEXT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PAID',
    "amount_minor" INTEGER NOT NULL,
    "paid_at" TIMESTAMP(3),

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refund_tickets" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "order_item_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "transaction_id" TEXT NOT NULL,
    "reason" "TicketReason" NOT NULL,
    "description" TEXT NOT NULL,
    "requested_action" "RequestedAction" NOT NULL,
    "requested_amount_minor" INTEGER NOT NULL,
    "status" "TicketStatus" NOT NULL DEFAULT 'PENDING_RITOS',
    "approval_source" "ApprovalSource",
    "policy_snapshot" JSONB NOT NULL,
    "simulate_refund_failure" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "refund_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refund_evidence" (
    "id" TEXT NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "type" "EvidenceType" NOT NULL,
    "filename" TEXT NOT NULL,
    "stored_path" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refund_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refund_decisions" (
    "id" TEXT NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "decision" "DecisionType" NOT NULL,
    "refund_percentage" INTEGER NOT NULL DEFAULT 100,
    "refund_amount_minor" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "confidence_score" DECIMAL(4,3) NOT NULL,
    "processed_by" TEXT NOT NULL,
    "requires_human_review" BOOLEAN NOT NULL DEFAULT false,
    "agent_trace" JSONB,
    "human_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refund_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refund_transactions" (
    "id" TEXT NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "transaction_id" TEXT NOT NULL,
    "amount_minor" INTEGER NOT NULL,
    "status" "RefundTxStatus" NOT NULL DEFAULT 'PENDING',
    "idempotency_key" TEXT NOT NULL,
    "failure_reason" TEXT,
    "settle_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refund_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "ticket_id" TEXT,
    "channel" "NotificationChannel" NOT NULL DEFAULT 'IN_APP',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_events" (
    "id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "status" "EventStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMP(3),

    CONSTRAINT "integration_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ritos_exchanges" (
    "id" TEXT NOT NULL,
    "ticket_id" TEXT,
    "direction" "ExchangeDirection" NOT NULL,
    "endpoint" TEXT NOT NULL,
    "request" JSONB,
    "response" JSONB,
    "http_status" INTEGER,
    "latency_ms" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ritos_exchanges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "key" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "response" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_session_token_key" ON "sessions"("session_token");

-- CreateIndex
CREATE UNIQUE INDEX "products_sku_key" ON "products"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "refund_policies_product_id_key" ON "refund_policies"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_order_id_key" ON "payments"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_transaction_id_key" ON "payments"("transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "refund_transactions_transaction_id_idempotency_key_key" ON "refund_transactions"("transaction_id", "idempotency_key");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund_policies" ADD CONSTRAINT "refund_policies_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund_tickets" ADD CONSTRAINT "refund_tickets_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund_tickets" ADD CONSTRAINT "refund_tickets_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund_tickets" ADD CONSTRAINT "refund_tickets_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund_tickets" ADD CONSTRAINT "refund_tickets_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund_evidence" ADD CONSTRAINT "refund_evidence_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "refund_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund_decisions" ADD CONSTRAINT "refund_decisions_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "refund_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund_transactions" ADD CONSTRAINT "refund_transactions_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "refund_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund_transactions" ADD CONSTRAINT "refund_transactions_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "payments"("transaction_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "refund_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

