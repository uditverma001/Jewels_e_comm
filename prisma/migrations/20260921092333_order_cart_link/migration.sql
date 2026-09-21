-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "cartId" TEXT;

-- CreateIndex
CREATE INDEX "Order_cartId_idx" ON "Order"("cartId");
