-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "giftMessage" TEXT,
ADD COLUMN     "giftWrap" BOOLEAN NOT NULL DEFAULT false;

-- A gift message is either absent or has content. An empty string is a third
-- state that means the same as absent, and it reaches the packing bench as a
-- blank card nobody asked for.
ALTER TABLE "Order"
  ADD CONSTRAINT "Order_giftMessage_not_blank"
    CHECK ("giftMessage" IS NULL OR length(btrim("giftMessage")) > 0);
