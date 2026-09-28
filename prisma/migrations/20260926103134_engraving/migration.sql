-- DropIndex
DROP INDEX "CartItem_cartId_variantId_key";

-- AlterTable
ALTER TABLE "CartItem" ADD COLUMN     "engravingKey" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "engravingText" TEXT;

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "engravingText" TEXT;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "engravingMaxLength" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "CartItem_cartId_variantId_engravingKey_key" ON "CartItem"("cartId", "variantId", "engravingKey");


-- Invariants Prisma cannot express.
--
-- `engravingKey` exists only to make the unique index above behave: Postgres
-- treats NULL as distinct from NULL, so keying on the nullable text directly
-- would let two plain lines of the same variant coexist. Keeping the two
-- columns in lockstep is therefore load-bearing, not tidiness — if they drift,
-- the bag silently splits or merges lines.
ALTER TABLE "CartItem"
  ADD CONSTRAINT "CartItem_engravingKey_matches_text"
    CHECK ("engravingKey" = COALESCE("engravingText", ''));

-- Blank is the same request as none, and an empty engraving reaches the bench
-- as a piece to be engraved with nothing.
ALTER TABLE "CartItem"
  ADD CONSTRAINT "CartItem_engravingText_not_blank"
    CHECK ("engravingText" IS NULL OR length(btrim("engravingText")) > 0);

ALTER TABLE "OrderItem"
  ADD CONSTRAINT "OrderItem_engravingText_not_blank"
    CHECK ("engravingText" IS NULL OR length(btrim("engravingText")) > 0);

-- A length limit is a physical fact about the piece, not a preference.
ALTER TABLE "Product"
  ADD CONSTRAINT "Product_engravingMaxLength_sane"
    CHECK ("engravingMaxLength" IS NULL OR ("engravingMaxLength" > 0 AND "engravingMaxLength" <= 200));
