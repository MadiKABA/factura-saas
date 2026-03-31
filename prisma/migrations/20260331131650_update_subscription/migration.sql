/*
  Warnings:

  - You are about to drop the column `maxExpenses` on the `Plan` table. All the data in the column will be lost.
  - You are about to drop the column `maxInvoices` on the `Plan` table. All the data in the column will be lost.
  - You are about to drop the column `maxSales` on the `Plan` table. All the data in the column will be lost.
  - You are about to drop the column `priceMonthly` on the `Plan` table. All the data in the column will be lost.
  - You are about to drop the column `priceYearly` on the `Plan` table. All the data in the column will be lost.
  - You are about to drop the column `externalId` on the `Subscription` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "BillingCycle" AS ENUM ('MONTHLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "SubscriptionInvoiceStatus" AS ENUM ('PENDING', 'PROCESSING', 'PAID', 'FAILED', 'CANCELED', 'REFUNDED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "SubscriptionStatus" ADD VALUE 'SUSPENDED';
ALTER TYPE "SubscriptionStatus" ADD VALUE 'EXPIRED';

-- AlterTable
ALTER TABLE "Plan" DROP COLUMN "maxExpenses",
DROP COLUMN "maxInvoices",
DROP COLUMN "maxSales",
DROP COLUMN "priceMonthly",
DROP COLUMN "priceYearly",
ADD COLUMN     "description" TEXT,
ADD COLUMN     "displayOrder" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "hasApiAccess" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "hasMultiUserModule" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "hasPrioritySupport" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "hasReportsModule" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "hasStockModule" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "maxInvoicesPerMonth" INTEGER,
ADD COLUMN     "maxSalesPerMonth" INTEGER,
ADD COLUMN     "maxStockBatchesPerMonth" INTEGER,
ADD COLUMN     "priceMonthlyXof" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "priceYearlyXof" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "Subscription" DROP COLUMN "externalId",
ADD COLUMN     "activatedAt" TIMESTAMP(3),
ADD COLUMN     "activatedByNote" TEXT,
ADD COLUMN     "billingCycle" "BillingCycle" NOT NULL DEFAULT 'MONTHLY',
ADD COLUMN     "canceledAt" TIMESTAMP(3),
ADD COLUMN     "currentPeriodStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "paydunyaCustomerId" TEXT,
ADD COLUMN     "trialEndsAt" TIMESTAMP(3),
ALTER COLUMN "status" SET DEFAULT 'TRIALING';

-- CreateTable
CREATE TABLE "SubscriptionInvoice" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "amountXof" DECIMAL(10,2) NOT NULL,
    "billingCycle" "BillingCycle" NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "status" "SubscriptionInvoiceStatus" NOT NULL DEFAULT 'PENDING',
    "paydunyaToken" TEXT,
    "paydunyaCheckoutUrl" TEXT,
    "paydunyaReference" TEXT,
    "paydunyaReceiptUrl" TEXT,
    "paidAt" TIMESTAMP(3),
    "paymentMethod" TEXT,
    "payerPhone" TEXT,
    "manuallyActivatedAt" TIMESTAMP(3),
    "manuallyActivatedById" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "ipnReceivedAt" TIMESTAMP(3),
    "ipnPayload" JSONB,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionUsage" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "salesCount" INTEGER NOT NULL DEFAULT 0,
    "invoicesCount" INTEGER NOT NULL DEFAULT 0,
    "stockBatchesCount" INTEGER NOT NULL DEFAULT 0,
    "activeProducts" INTEGER NOT NULL DEFAULT 0,
    "membersCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscriptionUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionInvoice_paydunyaToken_key" ON "SubscriptionInvoice"("paydunyaToken");

-- CreateIndex
CREATE INDEX "SubscriptionInvoice_organizationId_idx" ON "SubscriptionInvoice"("organizationId");

-- CreateIndex
CREATE INDEX "SubscriptionInvoice_status_idx" ON "SubscriptionInvoice"("status");

-- CreateIndex
CREATE INDEX "SubscriptionInvoice_paydunyaToken_idx" ON "SubscriptionInvoice"("paydunyaToken");

-- CreateIndex
CREATE INDEX "SubscriptionInvoice_organizationId_status_idx" ON "SubscriptionInvoice"("organizationId", "status");

-- CreateIndex
CREATE INDEX "SubscriptionUsage_organizationId_idx" ON "SubscriptionUsage"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionUsage_organizationId_year_month_key" ON "SubscriptionUsage"("organizationId", "year", "month");

-- CreateIndex
CREATE INDEX "Subscription_status_idx" ON "Subscription"("status");

-- CreateIndex
CREATE INDEX "Subscription_currentPeriodEnd_idx" ON "Subscription"("currentPeriodEnd");

-- AddForeignKey
ALTER TABLE "SubscriptionInvoice" ADD CONSTRAINT "SubscriptionInvoice_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionInvoice" ADD CONSTRAINT "SubscriptionInvoice_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionInvoice" ADD CONSTRAINT "SubscriptionInvoice_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionUsage" ADD CONSTRAINT "SubscriptionUsage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
