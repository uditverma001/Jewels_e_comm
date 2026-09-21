import 'server-only';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { conflict, notFound, validationError } from '@/server/errors';
import { slugify } from '@/lib/utils';
import { revalidateCatalog } from './revalidate';

/**
 * Admin product management.
 *
 * Every write is driven by a Zod schema rather than by spreading a request
 * body: an admin panel is exactly where mass assignment does the most damage,
 * because the fields nearby include price and stock.
 */

const tagSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(40)
  // Enforced in the database too (Product_tags_well_formed), because these
  // feed a generated tsvector that rejects empty and non-lowercase lexemes.
  .regex(/^[a-z0-9][a-z0-9 -]*$/, 'Tags may use lowercase letters, numbers, spaces and hyphens.');

export const variantInputSchema = z.object({
  id: z.string().max(40).optional(),
  sku: z
    .string()
    .trim()
    .toUpperCase()
    .min(3)
    .max(60)
    .regex(/^[A-Z0-9][A-Z0-9-]*$/, 'SKUs may use letters, numbers and hyphens.'),
  label: z.string().trim().min(1).max(80),
  /** Null inherits the product's base price. */
  priceMinor: z.coerce.number().int().min(0).max(1_000_000_000).nullable().optional(),
  compareAtPriceMinor: z.coerce.number().int().min(0).max(1_000_000_000).nullable().optional(),
  weightGrams: z.coerce.number().min(0).max(100_000).nullable().optional(),
  dimensions: z.string().trim().max(120).optional().or(z.literal('')),
  optionValue: z.string().trim().max(80).optional().or(z.literal('')),
  quantity: z.coerce.number().int().min(0).max(1_000_000),
  lowStockThreshold: z.coerce.number().int().min(0).max(10_000).default(3),
  isActive: z.coerce.boolean().default(true),
});

export const productInputSchema = z
  .object({
    name: z.string().trim().min(2).max(200),
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .max(220)
      .regex(/^[a-z0-9-]*$/, 'Slugs may use lowercase letters, numbers and hyphens.')
      .optional()
      .or(z.literal('')),
    sku: z
      .string()
      .trim()
      .toUpperCase()
      .min(3)
      .max(60)
      .regex(/^[A-Z0-9][A-Z0-9-]*$/, 'SKUs may use letters, numbers and hyphens.'),
    shortDescription: z.string().trim().max(300).optional().or(z.literal('')),
    description: z.string().trim().min(20).max(20_000),
    careInstructions: z.string().trim().max(4_000).optional().or(z.literal('')),
    status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']),
    audience: z.enum(['WOMEN', 'MEN', 'UNISEX', 'KIDS']),
    categoryId: z.string().min(1).max(40),
    brandId: z.string().max(40).optional().or(z.literal('')),
    collectionId: z.string().max(40).optional().or(z.literal('')),
    basePriceMinor: z.coerce.number().int().min(0).max(1_000_000_000),
    compareAtPriceMinor: z.coerce.number().int().min(0).max(1_000_000_000).nullable().optional(),
    tags: z.array(tagSchema).max(20).default([]),
    isFeatured: z.coerce.boolean().default(false),
    isBestSeller: z.coerce.boolean().default(false),
    metaTitle: z.string().trim().max(70).optional().or(z.literal('')),
    metaDescription: z.string().trim().max(170).optional().or(z.literal('')),
    optionName: z.string().trim().max(60).optional().or(z.literal('')),
    variants: z.array(variantInputSchema).min(1, 'A product needs at least one variant.').max(50),
    attributeValueIds: z.array(z.string().max(40)).max(30).default([]),
    specs: z
      .array(
        z.object({
          label: z.string().trim().min(1).max(80),
          value: z.string().trim().min(1).max(200),
        }),
      )
      .max(30)
      .default([]),
    media: z
      .array(
        z.object({
          url: z.string().trim().min(1).max(500),
          alt: z.string().trim().max(200),
          type: z.enum(['IMAGE', 'VIDEO']).default('IMAGE'),
        }),
      )
      .max(12)
      .default([]),
  })
  .superRefine((data, ctx) => {
    if (data.compareAtPriceMinor != null && data.compareAtPriceMinor <= data.basePriceMinor) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['compareAtPriceMinor'],
        message: 'The “was” price must be higher than the current price.',
      });
    }

    const skus = data.variants.map((variant) => variant.sku);
    if (new Set(skus).size !== skus.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['variants'],
        message: 'Every variant needs its own SKU.',
      });
    }

    // Variants are distinguished by their option value; without a name for the
    // option, more than one variant has nothing to tell them apart in the UI.
    if (data.variants.length > 1 && !data.optionName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['optionName'],
        message: 'Name the option (for example “Ring Size”) when there is more than one variant.',
      });
    }
  });

export type ProductInput = z.infer<typeof productInputSchema>;

async function assertSlugAvailable(slug: string, excludeId?: string): Promise<void> {
  const existing = await db.product.findFirst({
    where: { slug, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { id: true },
  });
  if (existing) throw conflict(`The URL “${slug}” is already used by another product.`);
}

async function assertSkuAvailable(sku: string, excludeId?: string): Promise<void> {
  const existing = await db.product.findFirst({
    where: { sku, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { id: true },
  });
  if (existing) throw conflict(`SKU ${sku} is already used by another product.`);
}

export async function createProduct(input: ProductInput, actorUserId: string): Promise<string> {
  const slug = input.slug || slugify(input.name);
  await assertSlugAvailable(slug);
  await assertSkuAvailable(input.sku);

  const productId = await db.$transaction(async (tx) => {
    const product = await tx.product.create({
      data: {
        name: input.name,
        slug,
        sku: input.sku,
        shortDescription: input.shortDescription || null,
        description: input.description,
        careInstructions: input.careInstructions || null,
        status: input.status,
        audience: input.audience,
        categoryId: input.categoryId,
        brandId: input.brandId || null,
        collectionId: input.collectionId || null,
        basePriceMinor: input.basePriceMinor,
        compareAtPriceMinor: input.compareAtPriceMinor ?? null,
        tags: input.tags,
        isFeatured: input.isFeatured,
        isBestSeller: input.isBestSeller,
        metaTitle: input.metaTitle || null,
        metaDescription: input.metaDescription || null,
        // Publishing is what makes a product visible; a draft has no date.
        publishedAt: input.status === 'ACTIVE' ? new Date() : null,
      },
    });

    await writeVariants(tx, product.id, input);
    await writeRelations(tx, product.id, input);

    await tx.auditLog.create({
      data: {
        actorUserId,
        action: 'product.created',
        entityType: 'Product',
        entityId: product.id,
        metadata: { sku: input.sku, name: input.name },
      },
    });

    return product.id;
  });

  await revalidateCatalog(slug);
  return productId;
}

export async function updateProduct(
  productId: string,
  input: ProductInput,
  actorUserId: string,
): Promise<void> {
  const existing = await db.product.findFirst({
    where: { id: productId, deletedAt: null },
    select: { id: true, slug: true, status: true, publishedAt: true },
  });
  if (!existing) throw notFound('That product no longer exists.');

  const slug = input.slug || slugify(input.name);
  await assertSlugAvailable(slug, productId);
  await assertSkuAvailable(input.sku, productId);

  await db.$transaction(async (tx) => {
    await tx.product.update({
      where: { id: productId },
      data: {
        name: input.name,
        slug,
        sku: input.sku,
        shortDescription: input.shortDescription || null,
        description: input.description,
        careInstructions: input.careInstructions || null,
        status: input.status,
        audience: input.audience,
        categoryId: input.categoryId,
        brandId: input.brandId || null,
        collectionId: input.collectionId || null,
        basePriceMinor: input.basePriceMinor,
        compareAtPriceMinor: input.compareAtPriceMinor ?? null,
        tags: input.tags,
        isFeatured: input.isFeatured,
        isBestSeller: input.isBestSeller,
        metaTitle: input.metaTitle || null,
        metaDescription: input.metaDescription || null,
        // Keep the original publish date: re-publishing a product should not
        // push it back to the top of "new arrivals".
        publishedAt:
          input.status === 'ACTIVE' ? (existing.publishedAt ?? new Date()) : existing.publishedAt,
      },
    });

    await writeVariants(tx, productId, input);
    await writeRelations(tx, productId, input);

    await tx.auditLog.create({
      data: {
        actorUserId,
        action: 'product.updated',
        entityType: 'Product',
        entityId: productId,
        metadata: { sku: input.sku },
      },
    });
  });

  await revalidateCatalog(slug, existing.slug);
}

/**
 * Reconcile variants.
 *
 * Variants that disappear from the form are deactivated rather than deleted:
 * order items reference them, and a hard delete would orphan purchase history
 * for the sake of a tidier table.
 */
async function writeVariants(
  tx: Prisma.TransactionClient,
  productId: string,
  input: ProductInput,
): Promise<void> {
  let optionId: string | null = null;

  if (input.optionName) {
    const option = await tx.productOption.upsert({
      where: { productId_name: { productId, name: input.optionName } },
      update: {},
      create: { productId, name: input.optionName },
      select: { id: true },
    });
    optionId = option.id;
  }

  const keptVariantIds: string[] = [];

  for (const [index, variant] of input.variants.entries()) {
    const data = {
      sku: variant.sku,
      label: variant.label,
      priceMinor: variant.priceMinor ?? null,
      compareAtPriceMinor: variant.compareAtPriceMinor ?? null,
      weightGrams: variant.weightGrams ?? null,
      dimensions: variant.dimensions || null,
      position: index,
      isActive: variant.isActive,
      // A variant matched by SKU may have been deactivated by an earlier edit;
      // re-listing it should bring it back, not leave a ghost row behind.
      deletedAt: null,
    };

    // Match by id when the form supplied one, and otherwise by SKU within this
    // product. Without the fallback, re-submitting a variant without its id
    // hits the unique SKU index and surfaces a raw database error instead of
    // updating the row that is plainly the same variant.
    const existing = variant.id
      ? await tx.productVariant.findFirst({
          where: { id: variant.id, productId },
          select: { id: true },
        })
      : await tx.productVariant.findFirst({
          where: { sku: variant.sku, productId },
          select: { id: true },
        });

    if (!existing) {
      // The SKU may still belong to a *different* product, which is a genuine
      // conflict the admin has to resolve rather than a row we can adopt.
      const owner = await tx.productVariant.findUnique({
        where: { sku: variant.sku },
        select: { productId: true },
      });
      if (owner && owner.productId !== productId) {
        throw conflict(`SKU ${variant.sku} already belongs to another product.`);
      }
    }

    const saved = existing
      ? await tx.productVariant.update({ where: { id: existing.id }, data })
      : await tx.productVariant.create({ data: { ...data, productId } });

    keptVariantIds.push(saved.id);

    await tx.inventory.upsert({
      where: { variantId: saved.id },
      create: {
        variantId: saved.id,
        quantity: variant.quantity,
        lowStockThreshold: variant.lowStockThreshold,
      },
      // Stock is set absolutely here. Reserved quantities are untouched, so an
      // in-flight checkout is not silently released by an admin edit.
      update: { quantity: variant.quantity, lowStockThreshold: variant.lowStockThreshold },
    });

    if (optionId && variant.optionValue) {
      const value = await tx.productOptionValue.upsert({
        where: { optionId_value: { optionId, value: variant.optionValue } },
        update: { position: index },
        create: { optionId, value: variant.optionValue, position: index },
        select: { id: true },
      });
      await tx.variantOptionValue.deleteMany({ where: { variantId: saved.id } });
      await tx.variantOptionValue.create({
        data: { variantId: saved.id, optionValueId: value.id },
      });
    }
  }

  await tx.productVariant.updateMany({
    where: { productId, id: { notIn: keptVariantIds }, deletedAt: null },
    data: { isActive: false, deletedAt: new Date() },
  });
}

async function writeRelations(
  tx: Prisma.TransactionClient,
  productId: string,
  input: ProductInput,
): Promise<void> {
  await tx.productAttributeValue.deleteMany({ where: { productId } });
  if (input.attributeValueIds.length > 0) {
    await tx.productAttributeValue.createMany({
      data: input.attributeValueIds.map((attributeValueId) => ({ productId, attributeValueId })),
      skipDuplicates: true,
    });
  }

  await tx.productSpec.deleteMany({ where: { productId } });
  if (input.specs.length > 0) {
    await tx.productSpec.createMany({
      data: input.specs.map((spec, index) => ({ productId, ...spec, position: index })),
    });
  }

  await tx.productMedia.deleteMany({ where: { productId } });
  if (input.media.length > 0) {
    await tx.productMedia.createMany({
      data: input.media.map((item, index) => ({
        productId,
        url: item.url,
        alt: item.alt || input.name,
        type: item.type,
        position: index,
      })),
    });
  }
}

/**
 * Archive rather than delete.
 *
 * Orders reference products, and "delete" in a shop almost always means "stop
 * selling this", not "erase the evidence that we ever sold it".
 */
export async function archiveProduct(productId: string, actorUserId: string): Promise<void> {
  const product = await db.product.findFirst({
    where: { id: productId, deletedAt: null },
    select: { id: true, slug: true },
  });
  if (!product) throw notFound('That product no longer exists.');

  await db.$transaction([
    db.product.update({
      where: { id: productId },
      data: { status: 'ARCHIVED', deletedAt: new Date() },
    }),
    db.auditLog.create({
      data: {
        actorUserId,
        action: 'product.archived',
        entityType: 'Product',
        entityId: productId,
      },
    }),
  ]);

  await revalidateCatalog(product.slug);
}

export async function restoreProduct(productId: string, actorUserId: string): Promise<void> {
  const product = await db.product.findFirst({
    where: { id: productId, deletedAt: { not: null } },
    select: { id: true, slug: true },
  });
  if (!product) throw notFound('That product is not archived.');

  await db.$transaction([
    db.product.update({ where: { id: productId }, data: { status: 'DRAFT', deletedAt: null } }),
    db.auditLog.create({
      data: {
        actorUserId,
        action: 'product.restored',
        entityType: 'Product',
        entityId: productId,
      },
    }),
  ]);

  await revalidateCatalog(product.slug);
}

export async function adjustStock(
  variantId: string,
  quantity: number,
  actorUserId: string,
): Promise<void> {
  if (!Number.isInteger(quantity) || quantity < 0) {
    throw validationError('Stock must be a whole number of zero or more.');
  }

  const variant = await db.productVariant.findUnique({
    where: { id: variantId },
    select: { id: true, sku: true, product: { select: { slug: true } } },
  });
  if (!variant) throw notFound('That variant no longer exists.');

  await db.$transaction([
    db.inventory.upsert({
      where: { variantId },
      create: { variantId, quantity },
      update: { quantity },
    }),
    db.auditLog.create({
      data: {
        actorUserId,
        action: 'inventory.adjusted',
        entityType: 'ProductVariant',
        entityId: variantId,
        metadata: { sku: variant.sku, quantity },
      },
    }),
  ]);

  await revalidateCatalog(variant.product.slug);
}

export interface AdminProductFilters {
  query?: string;
  status?: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  categoryId?: string;
  page: number;
}

const ADMIN_PAGE_SIZE = 20;

export async function listAdminProducts(filters: AdminProductFilters) {
  const where: Prisma.ProductWhereInput = {
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
    ...(filters.query
      ? {
          OR: [
            { name: { contains: filters.query, mode: 'insensitive' } },
            { sku: { contains: filters.query, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [products, total] = await Promise.all([
    db.product.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: ADMIN_PAGE_SIZE,
      skip: (filters.page - 1) * ADMIN_PAGE_SIZE,
      select: {
        id: true,
        name: true,
        slug: true,
        sku: true,
        status: true,
        basePriceMinor: true,
        updatedAt: true,
        deletedAt: true,
        category: { select: { name: true } },
        media: { where: { type: 'IMAGE' }, orderBy: { position: 'asc' }, take: 1 },
        variants: {
          where: { deletedAt: null },
          select: { id: true, inventory: { select: { quantity: true, reserved: true } } },
        },
      },
    }),
    db.product.count({ where }),
  ]);

  return {
    products: products.map((product) => ({
      ...product,
      totalStock: product.variants.reduce(
        (sum, variant) => sum + (variant.inventory?.quantity ?? 0),
        0,
      ),
      variantCount: product.variants.length,
    })),
    total,
    pageCount: Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE)),
    pageSize: ADMIN_PAGE_SIZE,
  };
}

export async function getAdminProduct(productId: string) {
  return db.product.findUnique({
    where: { id: productId },
    include: {
      media: { orderBy: { position: 'asc' } },
      specs: { orderBy: { position: 'asc' } },
      options: { include: { values: { orderBy: { position: 'asc' } } } },
      attributes: { select: { attributeValueId: true } },
      variants: {
        where: { deletedAt: null },
        orderBy: { position: 'asc' },
        include: {
          inventory: true,
          optionValues: { include: { optionValue: true } },
        },
      },
    },
  });
}

/** Reference data for the product form. */
export async function getProductFormData() {
  const [categories, brands, collections, attributes] = await Promise.all([
    db.category.findMany({
      where: { isActive: true },
      orderBy: [{ parentId: 'asc' }, { position: 'asc' }],
      select: { id: true, name: true, parent: { select: { name: true } } },
    }),
    db.brand.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    db.collection.findMany({
      where: { isActive: true },
      orderBy: { position: 'asc' },
      select: { id: true, name: true },
    }),
    db.attribute.findMany({
      orderBy: { position: 'asc' },
      select: {
        id: true,
        code: true,
        name: true,
        values: { orderBy: { position: 'asc' }, select: { id: true, value: true } },
      },
    }),
  ]);

  return { categories, brands, collections, attributes };
}
