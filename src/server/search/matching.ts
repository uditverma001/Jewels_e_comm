import { Prisma } from '@prisma/client';

/**
 * Shared text-matching predicates.
 *
 * Kept in one place because the listing query and the autocomplete query must
 * agree on what "matches" means — otherwise the suggestion dropdown offers a
 * product that the results page then fails to show.
 */

/**
 * Escape LIKE wildcards in user input.
 *
 * Without this, a customer searching for "50%" matches every product, and
 * "_" silently becomes a single-character wildcard. Paired with `ESCAPE '\'`
 * at the call site.
 */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/**
 * Trigram threshold for typo tolerance.
 *
 * `word_similarity(needle, haystack)` scores the needle against the best
 * matching *word* in the haystack, rather than against the whole string —
 * which is what we want for multi-word product names. Plain `similarity()`
 * scores "emerld" against "Vaani Emerald Pendant" at 0.21 (a miss), whereas
 * `word_similarity` scores it at 0.57 (a hit).
 */
export const WORD_SIMILARITY_THRESHOLD = 0.5;

/** Broad "does this product match the query" predicate, for listing and counts. */
export function productMatches(term: string): Prisma.Sql {
  const prefix = `${escapeLike(term)}%`;
  const wordPrefix = `% ${escapeLike(term)}%`;

  return Prisma.sql`(
    p."searchVector" @@ websearch_to_tsquery('english', ${term})
    OR p."name" ILIKE ${prefix} ESCAPE '\\'
    OR p."name" ILIKE ${wordPrefix} ESCAPE '\\'
    OR p."sku" ILIKE ${prefix} ESCAPE '\\'
    OR word_similarity(${term}, p."name") > ${WORD_SIMILARITY_THRESHOLD}
  )`;
}

/** Relevance ordering shared by search results and suggestions. */
export function productRelevanceOrder(term: string): Prisma.Sql {
  const prefix = `${escapeLike(term)}%`;
  return Prisma.sql`
    -- An exact SKU is almost always exactly what was meant.
    (p."sku" ILIKE ${term} ESCAPE '\\') DESC,
    (p."name" ILIKE ${prefix} ESCAPE '\\') DESC,
    ts_rank_cd(p."searchVector", websearch_to_tsquery('english', ${term})) DESC,
    word_similarity(${term}, p."name") DESC
  `;
}
