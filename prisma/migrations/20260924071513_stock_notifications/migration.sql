-- CreateTable
CREATE TABLE "StockNotification" (
    "id" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "email" CITEXT NOT NULL,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StockNotification_variantId_idx" ON "StockNotification"("variantId");

-- CreateIndex
CREATE INDEX "StockNotification_userId_idx" ON "StockNotification"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "StockNotification_variantId_email_key" ON "StockNotification"("variantId", "email");

-- AddForeignKey
ALTER TABLE "StockNotification" ADD CONSTRAINT "StockNotification_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockNotification" ADD CONSTRAINT "StockNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
