import 'server-only';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { productMatches, productRelevanceOrder } from '@/server/search/matching';
import type { CatalogFilters, FacetCode } from './schema';
import { FACET_CODES, PAGE_SIZE } from './schema';
import type { CatalogResult, Facet, FacetValue, PriceBounds, ProductCard } from './types';

/**
 * Catalogue listing.
 *
 * Written as parameterised SQL rather than through Prisma's query builder for
 * two reasons that are specific and not stylistic:
 *
 *  1. A product's price is the *minimum across its active variants* (a variant
 *     may override the base price), and its availability is the *sum* of
 *     variant stock. Both are per-product aggregates over a child table, which
 *     Prisma cannot express in a single filterable, sortable query.
 *  2. Faceting needs one `EXISTS` per selected attribute group — OR within a
 *     group, AND across groups — which is the correct faceted-search semantic
 *     and index-friendly, but not something the builder can produce.
 *
 * Every value is interpolated through `Prisma.sql` tagged templates, so the
 * driver parameterises it. No string concatenation of user input, anywhere.
 */

/** Per-product aggregate over active variants: price floor and stock. */
const VARIANT_AGGREGATE = Prisma.sql`
  LEFT JOIN LATERAL (
    SELECT
      MIN(COALESCE(v."priceMinor", p."basePriceMinor"))                        AS "priceMinor",
      MAX(COALESCE(v."compareAtPriceMinor", p."compareAtPriceMinor"))          AS "compareAtPriceMinor",
      COALESCE(SUM(GREATEST(COALESCE(i."quantity", 0) - COALESCE(i."reserved", 0), 0)), 0) AS "availableQuantity"
    FROM "ProductVariant" v
    LEFT JOIN "Inventory" i ON i."variantId" = v."id"
    WHERE v."productId" = p."id" AND v."isActive" = true AND v."deletedAt" IS NULL
  ) agg ON TRUE
`;

function baseConditions(filters: CatalogFilters): Prisma.Sql[] {
  const conditions: Prisma.Sql[] = [
    Prisma.sql`p."status" = 'ACTIVE'`,
    Prisma.sql`p."deletedAt" IS NULL`,
    Prisma.sql`p."publishedAt" IS NOT NULL AND p."publishedAt" <= NOW()`,
    // A product with no active variant cannot be bought, so it must not appear.
    Prisma.sql`agg."priceMinor" IS NOT NULL`,
  ];

  if (filters.categorySlug) {
    // Match the category or any descendant, so /rings includes
    // /rings/engagement without the customer having to ask for it.
    conditions.push(Prisma.sql`
      p."categoryId" IN (
        WITH RECURSIVE subtree AS (
          SELECT c."id" FROM "Category" c WHERE c."slug" = ${filters.categorySlug}
          UNION ALL
          SELECT child."id" FROM "Category" child
          JOIN subtree ON child."parentId" = subtree."id"
        )
        SELECT "id" FROM subtree
      )
    `);
  }

  if (filters.collectionSlug) {
    conditions.push(
      Prisma.sql`p."collectionId" = (SELECT "id" FROM "Collection" WHERE "slug" = ${filters.collectionSlug})`,
    );
  }

  if (filters.brandSlugs.length > 0) {
    conditions.push(
      Prisma.sql`p."brandId" IN (SELECT "id" FROM "Brand" WHERE "slug" IN (${Prisma.join(filters.brandSlugs)}))`,
    );
  }

  if (filters.audiences.length > 0) {
    conditions.push(Prisma.sql`p."audience"::text IN (${Prisma.join(filters.audiences)})`);
  }

  if (filters.minPriceMinor != null) {
    conditions.push(Prisma.sql`agg."priceMinor" >= ${filters.minPriceMinor}`);
  }
  if (filters.maxPriceMinor != null) {
    conditions.push(Prisma.sql`agg."priceMinor" <= ${filters.maxPriceMinor}`);
  }

  if (filters.inStockOnly) {
    conditions.push(Prisma.sql`agg."availableQuantity" > 0`);
  }

  if (filters.onSaleOnly) {
    conditions.push(
      Prisma.sql`agg."compareAtPriceMinor" IS NOT NULL AND agg."compareAtPriceMinor" > agg."priceMinor"`,
    );
  }

  // One EXISTS per attribute group: OR inside a group, AND between groups.
  for (const code of FACET_CODES) {
    const values = filters.facets[code];
    if (!values?.length) continue;
    conditions.push(Prisma.sql`
      EXISTS (
        SELECT 1
        FROM "ProductAttributeValue" pav
        JOIN "AttributeValue" av ON av."id" = pav."attributeValueId"
        JOIN "Attribute" a       ON a."id" = av."attributeId"
        WHERE pav."productId" = p."id"
          AND a."code" = ${code}
          AND av."slug" IN (${Prisma.join(values)})
      )
    `);
  }

  if (filters.q) {
    conditions.push(productMatches(filters.q));
  }

  return conditions;
}

function whereClause(conditions: Prisma.Sql[]): Prisma.Sql {
  return Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`;
}

function orderClause(filters: CatalogFilters): Prisma.Sql {
  switch (filters.sort) {
    case 'price-asc':
      return Prisma.sql`ORDER BY agg."priceMinor" ASC, p."id" ASC`;
    case 'price-desc':
      return Prisma.sql`ORDER BY agg."priceMinor" DESC, p."id" ASC`;
    case 'rating':
      return Prisma.sql`ORDER BY p."ratingAverage" DESC, p."ratingCount" DESC, p."id" ASC`;
    case 'popular':
      // "Best selling" is a real measurement, not a flag: units sold on paid
      // orders in the last 90 days, with the merchandising flag as tiebreak.
      return Prisma.sql`
        ORDER BY (
          SELECT COALESCE(SUM(oi."quantity"), 0)
          FROM "OrderItem" oi
          JOIN "Order" o ON o."id" = oi."orderId"
          WHERE oi."productId" = p."id"
            AND o."paymentStatus" = 'PAID'
            AND o."createdAt" > NOW() - INTERVAL '90 days'
        ) DESC, p."isBestSeller" DESC, p."id" ASC`;
    case 'relevance':
      return filters.q
        ? Prisma.sql`ORDER BY ${productRelevanceOrder(filters.q)}, p."id" ASC`
        : Prisma.sql`ORDER BY p."isFeatured" DESC, p."publishedAt" DESC NULLS LAST, p."id" ASC`;
    case 'newest':
    default:
      return Prisma.sql`ORDER BY p."publishedAt" DESC NULLS LAST, p."id" ASC`;
  }
}

interface ProductRow {
  id: string;
  slug: string;
  name: string;
  sku: string;
  shortDescription: string | null;
  priceMinor: number;
  compareAtPriceMinor: number | null;
  availableQuantity: bigint | number;
  ratingAverage: number;
  ratingCount: number;
  publishedAt: Date | null;
  categoryName: string;
  categorySlug: string;
  brandName: string | null;
  imageUrl: string | null;
  imageAlt: string | null;
  hoverImageUrl: string | null;
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function toProductCard(row: ProductRow): ProductCard {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    sku: row.sku,
    shortDescription: row.shortDescription,
    priceMinor: Number(row.priceMinor),
    compareAtPriceMinor:
      row.compareAtPriceMinor != null && Number(row.compareAtPriceMinor) > Number(row.priceMinor)
        ? Number(row.compareAtPriceMinor)
        : null,
    imageUrl: row.imageUrl,
    imageAlt: row.imageAlt ?? row.name,
    hoverImageUrl: row.hoverImageUrl,
    categoryName: row.categoryName,
    categorySlug: row.categorySlug,
    brandName: row.brandName,
    ratingAverage: Number(row.ratingAverage),
    ratingCount: Number(row.ratingCount),
    availableQuantity: Number(row.availableQuantity),
    isNew: row.publishedAt != null && Date.now() - row.publishedAt.getTime() < THIRTY_DAYS_MS,
  };
}

/** The two media columns every card needs: primary image and hover image. */
const MEDIA_SELECT = Prisma.sql`
  (SELECT m."url" FROM "ProductMedia" m
    WHERE m."productId" = p."id" AND m."type" = 'IMAGE'
    ORDER BY m."position" ASC LIMIT 1) AS "imageUrl",
  (SELECT m."alt" FROM "ProductMedia" m
    WHERE m."productId" = p."id" AND m."type" = 'IMAGE'
    ORDER BY m."position" ASC LIMIT 1) AS "imageAlt",
  (SELECT m."url" FROM "ProductMedia" m
    WHERE m."productId" = p."id" AND m."type" = 'IMAGE'
    ORDER BY m."position" ASC OFFSET 1 LIMIT 1) AS "hoverImageUrl"
`;

export async function findProducts(filters: CatalogFilters): Promise<CatalogResult> {
  const conditions = baseConditions(filters);
  const where = whereClause(conditions);
  const offset = (filters.page - 1) * PAGE_SIZE;

  const [rows, countRows, boundsRows] = await Promise.all([
    db.$queryRaw<ProductRow[]>`
      SELECT
        p."id", p."slug", p."name", p."sku", p."shortDescription",
        p."ratingAverage", p."ratingCount", p."publishedAt",
        agg."priceMinor", agg."compareAtPriceMinor", agg."availableQuantity",
        c."name" AS "categoryName", c."slug" AS "categorySlug",
        b."name" AS "brandName",
        ${MEDIA_SELECT}
      FROM "Product" p
      ${VARIANT_AGGREGATE}
      JOIN "Category" c ON c."id" = p."categoryId"
      LEFT JOIN "Brand" b ON b."id" = p."brandId"
      ${where}
      ${orderClause(filters)}
      LIMIT ${PAGE_SIZE} OFFSET ${offset}
    `,
    db.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::bigint AS count
      FROM "Product" p
      ${VARIANT_AGGREGATE}
      ${where}
    `,
    db.$queryRaw<{ min: number | null; max: number | null }[]>`
      SELECT MIN(agg."priceMinor")::int AS min, MAX(agg."priceMinor")::int AS max
      FROM "Product" p
      ${VARIANT_AGGREGATE}
      ${whereClause(priceUnconstrained(filters))}
    `,
  ]);

  const total = Number(countRows[0]?.count ?? 0);
  const bounds: PriceBounds = {
    minMinor: boundsRows[0]?.min ?? 0,
    maxMinor: boundsRows[0]?.max ?? 0,
  };

  const [facets, brands] = await Promise.all([countFacets(filters), countBrands(filters)]);

  return {
    products: rows.map(toProductCard),
    total,
    page: filters.page,
    pageSize: PAGE_SIZE,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    facets,
    brands,
    priceBounds: bounds,
  };
}

/**
 * Price bounds must reflect everything *except* the price filter itself,
 * otherwise dragging the slider narrows its own range and the customer can
 * never widen it again.
 */
function priceUnconstrained(filters: CatalogFilters): Prisma.Sql[] {
  return baseConditions({ ...filters, minPriceMinor: undefined, maxPriceMinor: undefined });
}

interface FacetRow {
  code: string;
  attributeName: string;
  slug: string;
  label: string;
  count: bigint;
  position: number;
}

/**
 * Facet counts.
 *
 * Counts for a facet group exclude that group's own selections, so the
 * customer can see what adding a second metal would return. This is what makes
 * a facet list feel alive rather than collapsing to a single option.
 */
async function countFacets(filters: CatalogFilters): Promise<Facet[]> {
  const results = await Promise.all(
    FACET_CODES.map(async (code) => {
      const conditions = baseConditions(withoutFacet(filters, code));
      const rows = await db.$queryRaw<FacetRow[]>`
        SELECT a."code", a."name" AS "attributeName", av."slug", av."value" AS "label",
               av."position", COUNT(DISTINCT p."id")::bigint AS "count"
        FROM "Product" p
        ${VARIANT_AGGREGATE}
        JOIN "ProductAttributeValue" pav ON pav."productId" = p."id"
        JOIN "AttributeValue" av ON av."id" = pav."attributeValueId"
        JOIN "Attribute" a ON a."id" = av."attributeId"
        ${whereClause([...conditions, Prisma.sql`a."code" = ${code}`, Prisma.sql`a."isFilterable" = true`])}
        GROUP BY a."code", a."name", av."slug", av."value", av."position"
        ORDER BY av."position" ASC, av."value" ASC
      `;
      return rows;
    }),
  );

  return results
    .filter((rows) => rows.length > 0)
    .map((rows) => ({
      code: rows[0]!.code,
      name: rows[0]!.attributeName,
      values: rows.map<FacetValue>((row) => ({
        slug: row.slug,
        label: row.label,
        count: Number(row.count),
      })),
    }));
}

function withoutFacet(filters: CatalogFilters, code: FacetCode): CatalogFilters {
  const facets = { ...filters.facets };
  delete facets[code];
  return { ...filters, facets };
}

async function countBrands(filters: CatalogFilters): Promise<FacetValue[]> {
  const conditions = baseConditions({ ...filters, brandSlugs: [] });
  const rows = await db.$queryRaw<{ slug: string; label: string; count: bigint }[]>`
    SELECT b."slug", b."name" AS "label", COUNT(DISTINCT p."id")::bigint AS "count"
    FROM "Product" p
    ${VARIANT_AGGREGATE}
    JOIN "Brand" b ON b."id" = p."brandId"
    ${whereClause(conditions)}
    GROUP BY b."slug", b."name"
    ORDER BY b."name" ASC
  `;
  return rows.map((row) => ({ slug: row.slug, label: row.label, count: Number(row.count) }));
}

/** Curated rails on the home page (featured, best sellers, new arrivals). */
export async function findProductRail(
  kind: 'featured' | 'best-seller' | 'new-arrival' | 'on-sale',
  limit = 8,
): Promise<ProductCard[]> {
  const extra =
    kind === 'featured'
      ? Prisma.sql`AND p."isFeatured" = true`
      : kind === 'best-seller'
        ? Prisma.sql`AND p."isBestSeller" = true`
        : kind === 'on-sale'
          ? Prisma.sql`AND agg."compareAtPriceMinor" IS NOT NULL AND agg."compareAtPriceMinor" > agg."priceMinor"`
          : Prisma.empty;

  const order =
    kind === 'new-arrival'
      ? Prisma.sql`ORDER BY p."publishedAt" DESC NULLS LAST`
      : Prisma.sql`ORDER BY p."publishedAt" DESC NULLS LAST, p."id" ASC`;

  const rows = await db.$queryRaw<ProductRow[]>`
    SELECT
      p."id", p."slug", p."name", p."sku", p."shortDescription",
      p."ratingAverage", p."ratingCount", p."publishedAt",
      agg."priceMinor", agg."compareAtPriceMinor", agg."availableQuantity",
      c."name" AS "categoryName", c."slug" AS "categorySlug",
      b."name" AS "brandName",
      ${MEDIA_SELECT}
    FROM "Product" p
    ${VARIANT_AGGREGATE}
    JOIN "Category" c ON c."id" = p."categoryId"
    LEFT JOIN "Brand" b ON b."id" = p."brandId"
    WHERE p."status" = 'ACTIVE'
      AND p."deletedAt" IS NULL
      AND p."publishedAt" IS NOT NULL AND p."publishedAt" <= NOW()
      AND agg."priceMinor" IS NOT NULL
      ${extra}
    ${order}
    LIMIT ${limit}
  `;
  return rows.map(toProductCard);
}

/** Related products: same category first, then the same collection. */
export async function findRelatedProducts(
  productId: string,
  categoryId: string,
  collectionId: string | null,
  limit = 4,
): Promise<ProductCard[]> {
  const rows = await db.$queryRaw<ProductRow[]>`
    SELECT
      p."id", p."slug", p."name", p."sku", p."shortDescription",
      p."ratingAverage", p."ratingCount", p."publishedAt",
      agg."priceMinor", agg."compareAtPriceMinor", agg."availableQuantity",
      c."name" AS "categoryName", c."slug" AS "categorySlug",
      b."name" AS "brandName",
      ${MEDIA_SELECT}
    FROM "Product" p
    ${VARIANT_AGGREGATE}
    JOIN "Category" c ON c."id" = p."categoryId"
    LEFT JOIN "Brand" b ON b."id" = p."brandId"
    WHERE p."status" = 'ACTIVE'
      AND p."deletedAt" IS NULL
      AND p."publishedAt" IS NOT NULL AND p."publishedAt" <= NOW()
      AND agg."priceMinor" IS NOT NULL
      AND p."id" <> ${productId}
      AND (p."categoryId" = ${categoryId}
           OR (${collectionId}::text IS NOT NULL AND p."collectionId" = ${collectionId}))
    ORDER BY (p."categoryId" = ${categoryId}) DESC, p."ratingCount" DESC, p."publishedAt" DESC NULLS LAST
    LIMIT ${limit}
  `;
  return rows.map(toProductCard);
}

/** Hydrate the "recently viewed" rail from ids held in the browser. */
export async function findProductsByIds(ids: string[]): Promise<ProductCard[]> {
  if (ids.length === 0) return [];
  const capped = ids.slice(0, 12);

  const rows = await db.$queryRaw<ProductRow[]>`
    SELECT
      p."id", p."slug", p."name", p."sku", p."shortDescription",
      p."ratingAverage", p."ratingCount", p."publishedAt",
      agg."priceMinor", agg."compareAtPriceMinor", agg."availableQuantity",
      c."name" AS "categoryName", c."slug" AS "categorySlug",
      b."name" AS "brandName",
      ${MEDIA_SELECT}
    FROM "Product" p
    ${VARIANT_AGGREGATE}
    JOIN "Category" c ON c."id" = p."categoryId"
    LEFT JOIN "Brand" b ON b."id" = p."brandId"
    WHERE p."status" = 'ACTIVE' AND p."deletedAt" IS NULL AND agg."priceMinor" IS NOT NULL
      AND p."id" IN (${Prisma.join(capped)})
  `;

  // Preserve the caller's ordering (most recently viewed first).
  const byId = new Map(rows.map((row) => [row.id, toProductCard(row)]));
  return capped.map((id) => byId.get(id)).filter((card): card is ProductCard => card != null);
}
