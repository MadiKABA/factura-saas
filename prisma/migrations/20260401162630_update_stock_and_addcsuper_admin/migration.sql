-- CreateEnum
CREATE TYPE "StockBatchType" AS ENUM ('RECEPTION', 'OUTPUT');

-- CreateEnum
CREATE TYPE "StockBatchStatus" AS ENUM ('DRAFT', 'VALIDATED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StockOutputReason" AS ENUM ('EXPIRED', 'DAMAGED', 'LOSS', 'THEFT', 'DONATION', 'OTHER');

-- AlterTable
ALTER TABLE "StockMovement" ADD COLUMN     "stockBatchId" TEXT;

-- CreateTable
CREATE TABLE "AdminUser" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "canManagePlans" BOOLEAN NOT NULL DEFAULT true,
    "canManageOrgs" BOOLEAN NOT NULL DEFAULT true,
    "canManageSubs" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockBatch" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "type" "StockBatchType" NOT NULL,
    "status" "StockBatchStatus" NOT NULL DEFAULT 'DRAFT',
    "number" TEXT NOT NULL,
    "vendorId" TEXT,
    "outputReason" "StockOutputReason",
    "externalRef" TEXT,
    "note" TEXT,
    "batchDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validatedAt" TIMESTAMP(3),
    "totalCost" DECIMAL(18,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockBatchItem" (
    "id" TEXT NOT NULL,
    "stockBatchId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" DECIMAL(18,2) NOT NULL,
    "unitCost" DECIMAL(18,2),
    "totalCost" DECIMAL(18,2),
    "batchNumber" TEXT,
    "expiryDate" TIMESTAMP(3),
    "note" TEXT,

    CONSTRAINT "StockBatchItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_userId_key" ON "AdminUser"("userId");

-- CreateIndex
CREATE INDEX "StockBatch_organizationId_idx" ON "StockBatch"("organizationId");

-- CreateIndex
CREATE INDEX "StockBatch_organizationId_status_idx" ON "StockBatch"("organizationId", "status");

-- CreateIndex
CREATE INDEX "StockBatch_organizationId_type_idx" ON "StockBatch"("organizationId", "type");

-- CreateIndex
CREATE INDEX "StockBatch_organizationId_batchDate_idx" ON "StockBatch"("organizationId", "batchDate");

-- CreateIndex
CREATE INDEX "StockBatch_vendorId_idx" ON "StockBatch"("vendorId");

-- CreateIndex
CREATE UNIQUE INDEX "StockBatch_organizationId_number_key" ON "StockBatch"("organizationId", "number");

-- CreateIndex
CREATE INDEX "StockBatchItem_stockBatchId_idx" ON "StockBatchItem"("stockBatchId");

-- CreateIndex
CREATE INDEX "StockBatchItem_productId_idx" ON "StockBatchItem"("productId");

-- CreateIndex
CREATE INDEX "Inventory_organizationId_status_idx" ON "Inventory"("organizationId", "status");

-- CreateIndex
CREATE INDEX "InventoryItem_productId_idx" ON "InventoryItem"("productId");

-- CreateIndex
CREATE INDEX "StockMovement_stockBatchId_idx" ON "StockMovement"("stockBatchId");

-- AddForeignKey
ALTER TABLE "AdminUser" ADD CONSTRAINT "AdminUser_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockBatch" ADD CONSTRAINT "StockBatch_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockBatch" ADD CONSTRAINT "StockBatch_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockBatchItem" ADD CONSTRAINT "StockBatchItem_stockBatchId_fkey" FOREIGN KEY ("stockBatchId") REFERENCES "StockBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockBatchItem" ADD CONSTRAINT "StockBatchItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_stockBatchId_fkey" FOREIGN KEY ("stockBatchId") REFERENCES "StockBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
