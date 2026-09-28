import type { PriceBreakdownView } from './price-breakdown';

import type { ProductStatus, TargetAudience } from '@prisma/client';

export interface ProductCard {
  id: string;
  slug: string;
  name: string;
  sku: string;
  shortDescription: string | null;
  priceMinor: number;
  compareAtPriceMinor: number | null;
  imageUrl: string | null;
  imageAlt: string | null;
  hoverImageUrl: string | null;
  categoryName: string;
  categorySlug: string;
  brandName: string | null;
  ratingAverage: number;
  ratingCount: number;
  availableQuantity: number;
  isNew: boolean;
}

export interface FacetValue {
  slug: string;
  label: string;
  count: number;
}

export interface Facet {
  code: string;
  name: string;
  values: FacetValue[];
}

export interface PriceBounds {
  minMinor: number;
  maxMinor: number;
}

export interface CatalogResult {
  products: ProductCard[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  facets: Facet[];
  brands: FacetValue[];
  priceBounds: PriceBounds;
}

export interface VariantView {
  id: string;
  sku: string;
  label: string;
  priceMinor: number;
  compareAtPriceMinor: number | null;
  weightGrams: number | null;
  dimensions: string | null;
  metalColor: string | null;
  availableQuantity: number;
  isPurchasable: boolean;
  /** optionId → optionValueId, used to drive the variant picker. */
  optionSelections: Record<string, string>;
}

export interface ProductOptionView {
  id: string;
  name: string;
  values: { id: string; value: string }[];
}

export interface ProductDetail {
  id: string;
  slug: string;
  name: string;
  sku: string;
  status: ProductStatus;
  description: string;
  shortDescription: string | null;
  careInstructions: string | null;
  audience: TargetAudience;
  tags: string[];
  metaTitle: string | null;
  metaDescription: string | null;
  ratingAverage: number;
  ratingCount: number;
  publishedAt: Date | null;

  priceMinor: number;
  compareAtPriceMinor: number | null;

  category: {
    id: string;
    name: string;
    slug: string;
    /** Parent category id, used to widen "related products" beyond a leaf. */
    parentId: string | null;
    parent: { name: string; slug: string } | null;
  };
  brand: { name: string; slug: string } | null;
  collection: { id: string; name: string; slug: string } | null;

  media: {
    id: string;
    url: string;
    alt: string;
    type: 'IMAGE' | 'VIDEO';
    variantId: string | null;
  }[];
  options: ProductOptionView[];
  variants: VariantView[];
  specs: { label: string; value: string }[];
  attributes: { code: string; name: string; value: string }[];

  totalAvailable: number;
  /** Maximum engraving length, or null when the piece cannot be engraved. */
  engravingMaxLength: number | null;
  /** GST rate for this product, resolved the same way checkout resolves it. */
  taxRateBps: number;
  /**
   * Per-variant price breakdown, keyed by variant id. A variant is absent when
   * it has no components, or when the ones it has do not sum to its price —
   * see `server/catalog/price-breakdown.ts` for why that is a silence rather
   * than an error.
   */
  priceBreakdowns: Record<string, PriceBreakdownView>;
}
