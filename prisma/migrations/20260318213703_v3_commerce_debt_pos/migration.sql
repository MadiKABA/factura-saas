/*
  Warnings:

  - A unique constraint covering the columns `[organizationId,name]` on the table `ExpenseCategory` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[organizationId,sku]` on the table `Product` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "OrganizationType" AS ENUM ('BUSINESS', 'RETAIL', 'RESTAURANT', 'PHARMACY', 'SALON', 'WHOLESALE');

-- CreateEnum
CREATE TYPE "SaleStatus" AS ENUM ('COMPLETED', 'REFUNDED', 'PARTIAL_REFUND', 'CANCELLED', 'ON_HOLD');

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('IN', 'OUT', 'ADJUSTMENT', 'LOSS', 'TRANSFER');

-- CreateEnum
CREATE TYPE "InventoryStatus" AS ENUM ('DRAFT', 'VALIDATED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CashSessionStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "DebtType" AS ENUM ('CUSTOMER', 'SUPPLIER');

-- CreateEnum
CREATE TYPE "DebtStatus" AS ENUM ('OPEN', 'PARTIAL', 'SETTLED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "PaymentMethod" ADD VALUE 'CREDIT';

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'CASHIER';

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "loyaltyPoints" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "note" TEXT;

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "receiptFooter" TEXT,
ADD COLUMN     "receiptHeader" TEXT,
ADD COLUMN     "receiptWidth" INTEGER NOT NULL DEFAULT 80,
ADD COLUMN     "type" "OrganizationType" NOT NULL DEFAULT 'BUSINESS',
ALTER COLUMN "defaultCurrency" SET DEFAULT 'XOF';

-- AlterTable
ALTER TABLE "Plan" ADD COLUMN     "maxSales" INTEGER;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "barcode" TEXT,
ADD COLUMN     "categoryId" TEXT,
ADD COLUMN     "costPrice" DECIMAL(18,2),
ADD COLUMN     "currentStock" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "expiryDate" TIMESTAMP(3),
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "isFavorite" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "minStockAlert" DECIMAL(18,2),
ADD COLUMN     "unit" TEXT NOT NULL DEFAULT 'pcs';

-- AlterTable
ALTER TABLE "Vendor" ADD COLUMN     "note" TEXT;

-- CreateTable
CREATE TABLE "ProductCategory" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "icon" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sale" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clientId" TEXT,
    "cashSessionId" TEXT,
    "number" TEXT NOT NULL,
    "status" "SaleStatus" NOT NULL DEFAULT 'COMPLETED',
    "subtotal" DECIMAL(18,2) NOT NULL,
    "taxTotal" DECIMAL(18,2) NOT NULL,
    "total" DECIMAL(18,2) NOT NULL,
    "amountPaid" DECIMAL(18,2) NOT NULL,
    "change" DECIMAL(18,2) NOT NULL,
    "discount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "currencyCode" TEXT NOT NULL,
    "tableNumber" TEXT,
    "note" TEXT,
    "isOffline" BOOLEAN NOT NULL DEFAULT false,
    "offlineId" TEXT,
    "saleDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SaleItem" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "productId" TEXT,
    "name" TEXT NOT NULL,
    "quantity" DECIMAL(18,2) NOT NULL,
    "unitPrice" DECIMAL(18,2) NOT NULL,
    "costPrice" DECIMAL(18,2),
    "discount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "taxRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "SaleItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalePayment" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "SalePayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "vendorId" TEXT,
    "type" "StockMovementType" NOT NULL,
    "quantity" DECIMAL(18,2) NOT NULL,
    "direction" INTEGER NOT NULL DEFAULT 1,
    "unitCost" DECIMAL(18,2),
    "totalCost" DECIMAL(18,2),
    "referenceType" TEXT,
    "referenceId" TEXT,
    "batchNumber" TEXT,
    "expiryDate" TIMESTAMP(3),
    "note" TEXT,
    "movedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Inventory" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "InventoryStatus" NOT NULL DEFAULT 'DRAFT',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Inventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryItem" (
    "id" TEXT NOT NULL,
    "inventoryId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "expectedQty" DECIMAL(18,2) NOT NULL,
    "countedQty" DECIMAL(18,2) NOT NULL,
    "variance" DECIMAL(18,2) NOT NULL,
    "note" TEXT,

    CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashSession" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "CashSessionStatus" NOT NULL DEFAULT 'OPEN',
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "openingBalance" DECIMAL(18,2) NOT NULL,
    "closingBalance" DECIMAL(18,2),
    "expectedBalance" DECIMAL(18,2),
    "variance" DECIMAL(18,2),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Debt" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "type" "DebtType" NOT NULL,
    "clientId" TEXT,
    "vendorId" TEXT,
    "contactName" TEXT,
    "contactPhone" TEXT,
    "description" TEXT,
    "amount" DECIMAL(18,2) NOT NULL,
    "amountPaid" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "currencyCode" TEXT NOT NULL DEFAULT 'XOF',
    "status" "DebtStatus" NOT NULL DEFAULT 'OPEN',
    "dueDate" TIMESTAMP(3),
    "saleId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Debt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DebtRepayment" (
    "id" TEXT NOT NULL,
    "debtId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL DEFAULT 'CASH',
    "note" TEXT,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DebtRepayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductCategory_organizationId_idx" ON "ProductCategory"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductCategory_organizationId_name_key" ON "ProductCategory"("organizationId", "name");

-- CreateIndex
CREATE INDEX "Sale_organizationId_idx" ON "Sale"("organizationId");

-- CreateIndex
CREATE INDEX "Sale_clientId_idx" ON "Sale"("clientId");

-- CreateIndex
CREATE INDEX "Sale_cashSessionId_idx" ON "Sale"("cashSessionId");

-- CreateIndex
CREATE INDEX "Sale_organizationId_saleDate_idx" ON "Sale"("organizationId", "saleDate");

-- CreateIndex
CREATE INDEX "Sale_status_idx" ON "Sale"("status");

-- CreateIndex
CREATE INDEX "Sale_offlineId_idx" ON "Sale"("offlineId");

-- CreateIndex
CREATE UNIQUE INDEX "Sale_organizationId_number_key" ON "Sale"("organizationId", "number");

-- CreateIndex
CREATE INDEX "SaleItem_saleId_idx" ON "SaleItem"("saleId");

-- CreateIndex
CREATE INDEX "SaleItem_productId_idx" ON "SaleItem"("productId");

-- CreateIndex
CREATE INDEX "SalePayment_saleId_idx" ON "SalePayment"("saleId");

-- CreateIndex
CREATE INDEX "StockMovement_organizationId_idx" ON "StockMovement"("organizationId");

-- CreateIndex
CREATE INDEX "StockMovement_productId_idx" ON "StockMovement"("productId");

-- CreateIndex
CREATE INDEX "StockMovement_organizationId_movedAt_idx" ON "StockMovement"("organizationId", "movedAt");

-- CreateIndex
CREATE INDEX "StockMovement_referenceType_referenceId_idx" ON "StockMovement"("referenceType", "referenceId");

-- CreateIndex
CREATE INDEX "Inventory_organizationId_idx" ON "Inventory"("organizationId");

-- CreateIndex
CREATE INDEX "InventoryItem_inventoryId_idx" ON "InventoryItem"("inventoryId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_inventoryId_productId_key" ON "InventoryItem"("inventoryId", "productId");

-- CreateIndex
CREATE INDEX "CashSession_organizationId_idx" ON "CashSession"("organizationId");

-- CreateIndex
CREATE INDEX "CashSession_organizationId_status_idx" ON "CashSession"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Debt_saleId_key" ON "Debt"("saleId");

-- CreateIndex
CREATE INDEX "Debt_organizationId_idx" ON "Debt"("organizationId");

-- CreateIndex
CREATE INDEX "Debt_organizationId_type_idx" ON "Debt"("organizationId", "type");

-- CreateIndex
CREATE INDEX "Debt_organizationId_status_idx" ON "Debt"("organizationId", "status");

-- CreateIndex
CREATE INDEX "Debt_organizationId_type_status_idx" ON "Debt"("organizationId", "type", "status");

-- CreateIndex
CREATE INDEX "Debt_clientId_idx" ON "Debt"("clientId");

-- CreateIndex
CREATE INDEX "Debt_vendorId_idx" ON "Debt"("vendorId");

-- CreateIndex
CREATE INDEX "Debt_dueDate_idx" ON "Debt"("dueDate");

-- CreateIndex
CREATE INDEX "DebtRepayment_debtId_idx" ON "DebtRepayment"("debtId");

-- CreateIndex
CREATE INDEX "Client_organizationId_phone_idx" ON "Client"("organizationId", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseCategory_organizationId_name_key" ON "ExpenseCategory"("organizationId", "name");

-- CreateIndex
CREATE INDEX "Product_organizationId_isActive_idx" ON "Product"("organizationId", "isActive");

-- CreateIndex
CREATE INDEX "Product_organizationId_isFavorite_idx" ON "Product"("organizationId", "isFavorite");

-- CreateIndex
CREATE INDEX "Product_barcode_idx" ON "Product"("barcode");

-- CreateIndex
CREATE INDEX "Product_organizationId_categoryId_idx" ON "Product"("organizationId", "categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "Product_organizationId_sku_key" ON "Product"("organizationId", "sku");

-- AddForeignKey
ALTER TABLE "ProductCategory" ADD CONSTRAINT "ProductCategory_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ProductCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_cashSessionId_fkey" FOREIGN KEY ("cashSessionId") REFERENCES "CashSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalePayment" ADD CONSTRAINT "SalePayment_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inventory" ADD CONSTRAINT "Inventory_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_inventoryId_fkey" FOREIGN KEY ("inventoryId") REFERENCES "Inventory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashSession" ADD CONSTRAINT "CashSession_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashSession" ADD CONSTRAINT "CashSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Debt" ADD CONSTRAINT "Debt_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Debt" ADD CONSTRAINT "Debt_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Debt" ADD CONSTRAINT "Debt_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Debt" ADD CONSTRAINT "Debt_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtRepayment" ADD CONSTRAINT "DebtRepayment_debtId_fkey" FOREIGN KEY ("debtId") REFERENCES "Debt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
