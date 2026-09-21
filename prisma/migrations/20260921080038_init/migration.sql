/*
  Warnings:

  - You are about to drop the column `searchVector` on the `Product` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "Brand_name_trgm_idx";

-- DropIndex
DROP INDEX "Category_name_trgm_idx";

-- DropIndex
DROP INDEX "Product_name_trgm_idx";

-- DropIndex
DROP INDEX "Product_searchVector_idx";

-- DropIndex
DROP INDEX "Product_sku_trgm_idx";

-- DropIndex
DROP INDEX "Product_tags_idx";

-- AlterTable
ALTER TABLE "NewsletterSubscriber" ALTER COLUMN "email" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "Product" DROP COLUMN "searchVector";

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "email" SET DATA TYPE TEXT;
