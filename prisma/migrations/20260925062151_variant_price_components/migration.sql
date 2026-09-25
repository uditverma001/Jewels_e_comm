-- CreateEnum
CREATE TYPE "PriceComponentKind" AS ENUM ('METAL', 'MAKING', 'STONE', 'HALLMARKING', 'OTHER');

-- CreateTable
CREATE TABLE "VariantPriceComponent" (
    "id" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "kind" "PriceComponentKind" NOT NULL,
    "label" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "quantity" DECIMAL(10,3),
    "unit" TEXT,
    "ratePerUnitMinor" INTEGER,

    CONSTRAINT "VariantPriceComponent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VariantPriceComponent_variantId_position_idx" ON "VariantPriceComponent"("variantId", "position");

-- AddForeignKey
ALTER TABLE "VariantPriceComponent" ADD CONSTRAINT "VariantPriceComponent_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Invariants Prisma cannot express, added by hand.
--
-- A component with a quantity must say what unit it is in and what rate it was
-- priced at, or the line reads "6.420" with no way to check the arithmetic —
-- which defeats the purpose of showing a breakdown at all.
ALTER TABLE "VariantPriceComponent"
  ADD CONSTRAINT "VariantPriceComponent_quantity_is_complete"
    CHECK (
      ("quantity" IS NULL AND "unit" IS NULL AND "ratePerUnitMinor" IS NULL)
      OR ("quantity" IS NOT NULL AND "unit" IS NOT NULL AND "ratePerUnitMinor" IS NOT NULL)
    );

-- Money is never negative here. A discount is a discount, not a negative
-- component smuggled into the make-up of the piece.
ALTER TABLE "VariantPriceComponent"
  ADD CONSTRAINT "VariantPriceComponent_amount_non_negative"
    CHECK ("amountMinor" >= 0);

ALTER TABLE "VariantPriceComponent"
  ADD CONSTRAINT "VariantPriceComponent_quantity_positive"
    CHECK ("quantity" IS NULL OR "quantity" > 0);

ALTER TABLE "VariantPriceComponent"
  ADD CONSTRAINT "VariantPriceComponent_unit_known"
    CHECK ("unit" IS NULL OR "unit" IN ('g', 'ct'));
