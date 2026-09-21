import 'server-only';
import { db } from '@/lib/db';
import {
  escapeLike,
  productMatches,
  productRelevanceOrder,
  WORD_SIMILARITY_THRESHOLD,
} from './matching';

/**
 * Search.
 *
 * Postgres full-text (weighted tsvector, GIN) with a trigram fallback for
 * typos. No second datastore: see ARCHITECTURE.md §2.6 for the concrete
 * threshold at which that stops being the right answer.
 *
 * `websearch_to_tsquery` is used rather than `plainto_tsquery` because it
 * understands quoted phrases and `-exclusions` from the search box without us
 * writing a parser — and, importantly, it never throws on malformed input the
 * way `to_tsquery` does.
 */

export interface ProductSuggestion {
  type: 'product';
  slug: string;
  name: string;
  sku: string;
  priceMinor: number;
  imageUrl: string | null;
  categoryName: string;
}

export interface TaxonomySuggestion {
  type: 'category' | 'collection' | 'brand';
  slug: string;
  name: string;
  productCount: number;
}

export type Suggestion = ProductSuggestion | TaxonomySuggestion;

export interface SuggestionResult {
  products: ProductSuggestion[];
  taxonomy: TaxonomySuggestion[];
  /** Total matching products, so the UI can offer "see all N results". */
  totalProducts: number;
}

const MIN_QUERY_LENGTH = 2;

export async function suggest(rawQuery: string, limit = 6): Promise<SuggestionResult> {
  const query = rawQuery.trim();
  if (query.length < MIN_QUERY_LENGTH) {
    return { products: [], taxonomy: [], totalProducts: 0 };
  }

  const contains = `%${escapeLike(query)}%`;

  const [products, categories, collections, brands, countRows] = await Promise.all([
    db.$queryRaw<
      {
        slug: string;
        name: string;
        sku: string;
        priceMinor: number;
        imageUrl: string | null;
        categoryName: string;
      }[]
    >`
      SELECT p."slug", p."name", p."sku",
             COALESCE(
               (SELECT MIN(COALESCE(v."priceMinor", p."basePriceMinor"))
                  FROM "ProductVariant" v
                 WHERE v."productId" = p."id" AND v."isActive" AND v."deletedAt" IS NULL),
               p."basePriceMinor"
             )::int AS "priceMinor",
             (SELECT m."url" FROM "ProductMedia" m
               WHERE m."productId" = p."id" AND m."type" = 'IMAGE'
               ORDER BY m."position" ASC LIMIT 1) AS "imageUrl",
             c."name" AS "categoryName"
      FROM "Product" p
      JOIN "Category" c ON c."id" = p."categoryId"
      WHERE p."status" = 'ACTIVE' AND p."deletedAt" IS NULL
        AND p."publishedAt" IS NOT NULL AND p."publishedAt" <= NOW()
        AND ${productMatches(query)}
      ORDER BY ${productRelevanceOrder(query)}
      LIMIT ${limit}
    `,
    db.$queryRaw<{ slug: string; name: string; count: bigint }[]>`
      SELECT c."slug", c."name", COUNT(p."id")::bigint AS count
      FROM "Category" c
      LEFT JOIN "Product" p
        ON p."categoryId" = c."id" AND p."status" = 'ACTIVE' AND p."deletedAt" IS NULL
      WHERE c."isActive" = true
        AND (c."name" ILIKE ${contains} ESCAPE '\\' OR word_similarity(${query}, c."name") > ${WORD_SIMILARITY_THRESHOLD})
      GROUP BY c."slug", c."name"
      ORDER BY count DESC
      LIMIT 3
    `,
    db.$queryRaw<{ slug: string; name: string; count: bigint }[]>`
      SELECT col."slug", col."name", COUNT(p."id")::bigint AS count
      FROM "Collection" col
      LEFT JOIN "Product" p
        ON p."collectionId" = col."id" AND p."status" = 'ACTIVE' AND p."deletedAt" IS NULL
      WHERE col."isActive" = true AND col."name" ILIKE ${contains} ESCAPE '\\'
      GROUP BY col."slug", col."name"
      ORDER BY count DESC
      LIMIT 2
    `,
    db.$queryRaw<{ slug: string; name: string; count: bigint }[]>`
      SELECT b."slug", b."name", COUNT(p."id")::bigint AS count
      FROM "Brand" b
      LEFT JOIN "Product" p
        ON p."brandId" = b."id" AND p."status" = 'ACTIVE' AND p."deletedAt" IS NULL
      WHERE b."name" ILIKE ${contains} ESCAPE '\\'
         OR word_similarity(${query}, b."name") > ${WORD_SIMILARITY_THRESHOLD}
      GROUP BY b."slug", b."name"
      ORDER BY count DESC
      LIMIT 2
    `,
    db.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::bigint AS count
      FROM "Product" p
      WHERE p."status" = 'ACTIVE' AND p."deletedAt" IS NULL
        AND p."publishedAt" IS NOT NULL AND p."publishedAt" <= NOW()
        AND ${productMatches(query)}
    `,
  ]);

  const taxonomy: TaxonomySuggestion[] = [
    ...categories.map((row) => ({
      type: 'category' as const,
      slug: row.slug,
      name: row.name,
      productCount: Number(row.count),
    })),
    ...collections.map((row) => ({
      type: 'collection' as const,
      slug: row.slug,
      name: row.name,
      productCount: Number(row.count),
    })),
    ...brands.map((row) => ({
      type: 'brand' as const,
      slug: row.slug,
      name: row.name,
      productCount: Number(row.count),
    })),
  ].filter((entry) => entry.productCount > 0);

  return {
    products: products.map((row) => ({ type: 'product' as const, ...row })),
    taxonomy,
    totalProducts: Number(countRows[0]?.count ?? 0),
  };
}

/**
 * "Did you mean" suggestion when a search returns nothing, using trigram
 * distance against product and category names.
 */
export async function didYouMean(rawQuery: string): Promise<string | null> {
  const query = rawQuery.trim();
  if (query.length < 3) return null;

  const rows = await db.$queryRaw<{ name: string }[]>`
    SELECT "name"
    FROM (
      SELECT p."name", word_similarity(${query}, p."name") AS score
      FROM "Product" p
      WHERE p."status" = 'ACTIVE' AND p."deletedAt" IS NULL
      UNION ALL
      SELECT c."name", word_similarity(${query}, c."name") AS score
      FROM "Category" c WHERE c."isActive" = true
    ) candidates
    WHERE score > ${WORD_SIMILARITY_THRESHOLD}
    ORDER BY score DESC
    LIMIT 1
  `;
  return rows[0]?.name ?? null;
}

/** Popular searches shown in an empty search box. Derived from the catalogue. */
export async function trendingSearches(limit = 6): Promise<string[]> {
  const rows = await db.$queryRaw<{ tag: string }[]>`
    SELECT tag, COUNT(*)::bigint AS uses
    FROM "Product" p, UNNEST(p."tags") AS tag
    WHERE p."status" = 'ACTIVE' AND p."deletedAt" IS NULL
    GROUP BY tag
    ORDER BY uses DESC, tag ASC
    LIMIT ${limit}
  `;
  return rows.map((row) => row.tag);
}
