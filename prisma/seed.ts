import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { hash } from '@node-rs/argon2';
import { slugify } from '../src/lib/utils';
import { buildSeedComponents } from './price-components';
import { assertBreakdownReconciles } from '../src/server/catalog/price-breakdown';
import {
  ATTRIBUTES,
  BRANDS,
  CATEGORIES,
  COLLECTIONS,
  COUPONS,
  PRODUCTS,
  productImage,
  SHIPPING_METHODS,
} from './seed-data';

/**
 * Development seed.
 *
 * Idempotent: every write is an upsert keyed on a natural unique column, so
 * running it repeatedly converges rather than duplicating. It is safe to run
 * against a database that already has orders in it.
 */

const db = new PrismaClient();

const ARGON2_OPTIONS = {
  algorithm: 2 as const,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
};

async function seedUsers() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL;
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  const customerEmail = process.env.SEED_CUSTOMER_EMAIL;
  const customerPassword = process.env.SEED_CUSTOMER_PASSWORD;

  if (!adminEmail || !adminPassword) {
    console.warn('• Skipping user seed: SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD not set');
    return;
  }

  await db.user.upsert({
    where: { email: adminEmail },
    update: { role: 'ADMIN' },
    create: {
      email: adminEmail,
      passwordHash: await hash(adminPassword, ARGON2_OPTIONS),
      firstName: 'Aurelia',
      lastName: 'Admin',
      role: 'ADMIN',
      emailVerifiedAt: new Date(),
    },
  });
  console.info(`✓ Admin user: ${adminEmail}`);

  if (customerEmail && customerPassword) {
    const customer = await db.user.upsert({
      where: { email: customerEmail },
      update: {},
      create: {
        email: customerEmail,
        passwordHash: await hash(customerPassword, ARGON2_OPTIONS),
        firstName: 'Priya',
        lastName: 'Sharma',
        phone: '+91 98200 11223',
        emailVerifiedAt: new Date(),
      },
    });

    await db.wishlist.upsert({
      where: { userId: customer.id },
      update: {},
      create: { userId: customer.id },
    });

    const existingAddress = await db.address.findFirst({ where: { userId: customer.id } });
    if (!existingAddress) {
      await db.address.create({
        data: {
          userId: customer.id,
          label: 'Home',
          fullName: 'Priya Sharma',
          phone: '+91 98200 11223',
          line1: '14 Carmichael Road',
          line2: 'Apartment 7B',
          city: 'Mumbai',
          state: 'Maharashtra',
          postalCode: '400026',
          isDefault: true,
        },
      });
    }
    console.info(`✓ Customer user: ${customerEmail}`);
  }
}

async function seedTaxonomy() {
  const categoryIds = new Map<string, string>();

  for (const [index, category] of CATEGORIES.entries()) {
    const parent = await db.category.upsert({
      where: { slug: category.slug },
      update: {
        name: category.name,
        description: category.description,
        imageUrl: category.imageUrl,
        position: index,
      },
      create: {
        name: category.name,
        slug: category.slug,
        description: category.description,
        imageUrl: category.imageUrl,
        position: index,
        metaTitle: `${category.name} — Fine Jewellery`,
        metaDescription: category.description.slice(0, 155),
      },
    });
    categoryIds.set(category.slug, parent.id);

    for (const [childIndex, child] of category.children.entries()) {
      const created = await db.category.upsert({
        where: { slug: child.slug },
        update: { name: child.name, parentId: parent.id, position: childIndex },
        create: {
          name: child.name,
          slug: child.slug,
          parentId: parent.id,
          position: childIndex,
          description: `${child.name} from our ${category.name.toLowerCase()} collection.`,
        },
      });
      categoryIds.set(child.slug, created.id);
    }
  }

  const collectionIds = new Map<string, string>();
  for (const collection of COLLECTIONS) {
    const created = await db.collection.upsert({
      where: { slug: collection.slug },
      update: {
        name: collection.name,
        description: collection.description,
        heroImageUrl: collection.heroImageUrl,
        isFeatured: collection.isFeatured,
        position: collection.position,
      },
      create: {
        name: collection.name,
        slug: collection.slug,
        description: collection.description,
        heroImageUrl: collection.heroImageUrl,
        isFeatured: collection.isFeatured,
        position: collection.position,
        metaTitle: `The ${collection.name} Collection`,
        metaDescription: collection.description.slice(0, 155),
      },
    });
    collectionIds.set(collection.slug, created.id);
  }

  const brandIds = new Map<string, string>();
  for (const brand of BRANDS) {
    const created = await db.brand.upsert({
      where: { slug: brand.slug },
      update: { name: brand.name, description: brand.description },
      create: { name: brand.name, slug: brand.slug, description: brand.description },
    });
    brandIds.set(brand.slug, created.id);
  }

  // attribute code → (value → attributeValueId)
  const attributeValueIds = new Map<string, Map<string, string>>();
  for (const [index, attribute] of ATTRIBUTES.entries()) {
    const created = await db.attribute.upsert({
      where: { code: attribute.code },
      update: { name: attribute.name, position: index },
      create: { code: attribute.code, name: attribute.name, position: index },
    });

    const values = new Map<string, string>();
    for (const [valueIndex, value] of attribute.values.entries()) {
      const slug = slugify(value);
      const createdValue = await db.attributeValue.upsert({
        where: { attributeId_slug: { attributeId: created.id, slug } },
        update: { value, position: valueIndex },
        create: { attributeId: created.id, value, slug, position: valueIndex },
      });
      values.set(value, createdValue.id);
    }
    attributeValueIds.set(attribute.code, values);
  }

  console.info(
    `✓ Taxonomy: ${categoryIds.size} categories, ${collectionIds.size} collections, ${brandIds.size} brands`,
  );
  return { categoryIds, collectionIds, brandIds, attributeValueIds };
}

type Taxonomy = Awaited<ReturnType<typeof seedTaxonomy>>;

/**
 * Total carat weight, summed from the product's own specs.
 *
 * Several pieces state stones in more than one line — "2.10ct Zambian emerald"
 * plus "0.35ct brilliants" — and the breakdown has to price all of them, not
 * just the first. Read back from the specs rather than restated in a second
 * field, so the two can never disagree.
 */
function caratsFromSpecs(specs: readonly { label: string; value: string }[]): number | null {
  let total = 0;
  for (const spec of specs) {
    // Only the first figure per spec: "0.50ct (0.25ct each)" is one weight
    // stated two ways, not three-quarters of a carat.
    const match = /([\d.]+)\s*ct\b/i.exec(spec.value);
    if (!match) continue;
    const carats = Number(match[1]);
    if (Number.isFinite(carats) && carats > 0) total += carats;
  }
  return total > 0 ? round3(total) : null;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

async function seedProducts(taxonomy: Taxonomy) {
  const { categoryIds, collectionIds, brandIds, attributeValueIds } = taxonomy;
  let publishedOffset = 0;

  for (const seed of PRODUCTS) {
    const categoryId = categoryIds.get(seed.category);
    const brandId = brandIds.get(seed.brand);
    if (!categoryId || !brandId) {
      throw new Error(`Seed product ${seed.sku} references a missing category or brand`);
    }

    // Stagger publish dates so "new arrivals" has a meaningful order.
    publishedOffset += 3;
    const publishedAt = new Date(Date.now() - publishedOffset * 24 * 60 * 60 * 1000);

    const product = await db.product.upsert({
      where: { sku: seed.sku },
      update: {
        name: seed.name,
        basePriceMinor: seed.basePriceMinor,
        compareAtPriceMinor: seed.compareAtPriceMinor ?? null,
        status: 'ACTIVE',
        isFeatured: seed.isFeatured ?? false,
        isBestSeller: seed.isBestSeller ?? false,
        engravingMaxLength: seed.engravingMaxLength ?? null,
      },
      create: {
        name: seed.name,
        slug: slugify(seed.name),
        sku: seed.sku,
        shortDescription: seed.shortDescription,
        description: seed.description,
        careInstructions: seed.careInstructions,
        status: 'ACTIVE',
        audience: seed.audience,
        categoryId,
        brandId,
        collectionId: seed.collection ? (collectionIds.get(seed.collection) ?? null) : null,
        basePriceMinor: seed.basePriceMinor,
        compareAtPriceMinor: seed.compareAtPriceMinor ?? null,
        engravingMaxLength: seed.engravingMaxLength ?? null,
        tags: seed.tags,
        isFeatured: seed.isFeatured ?? false,
        isBestSeller: seed.isBestSeller ?? false,
        publishedAt,
        metaTitle: `${seed.name} | Aurelia`,
        metaDescription: seed.shortDescription.slice(0, 155),
      },
    });

    // Media, specs and attributes are fully replaced so the seed stays the
    // source of truth for them.
    await db.productMedia.deleteMany({ where: { productId: product.id } });
    await db.productMedia.createMany({
      data: Array.from({ length: seed.imageCount }, (_, index) => ({
        productId: product.id,
        url: productImage(seed.sku, index + 1),
        alt: `${seed.name} — view ${index + 1}`,
        type: 'IMAGE' as const,
        position: index,
        width: 1200,
        height: 1500,
      })),
    });

    await db.productSpec.deleteMany({ where: { productId: product.id } });
    await db.productSpec.createMany({
      data: seed.specs.map((spec, index) => ({
        productId: product.id,
        label: spec.label,
        value: spec.value,
        position: index,
      })),
    });

    await db.productAttributeValue.deleteMany({ where: { productId: product.id } });
    for (const [code, value] of Object.entries(seed.attributes)) {
      const attributeValueId = attributeValueIds.get(code)?.get(value);
      if (!attributeValueId) {
        throw new Error(`Seed product ${seed.sku} references unknown attribute ${code}=${value}`);
      }
      await db.productAttributeValue.create({
        data: { productId: product.id, attributeValueId },
      });
    }

    // Variant options, then variants themselves.
    let optionId: string | null = null;
    const optionValueIds = new Map<string, string>();

    if (seed.optionName) {
      const option = await db.productOption.upsert({
        where: { productId_name: { productId: product.id, name: seed.optionName } },
        update: {},
        create: { productId: product.id, name: seed.optionName, position: 0 },
      });
      optionId = option.id;

      for (const [index, variant] of seed.variants.entries()) {
        if (!variant.optionValue) continue;
        const value = await db.productOptionValue.upsert({
          where: { optionId_value: { optionId: option.id, value: variant.optionValue } },
          update: { position: index },
          create: { optionId: option.id, value: variant.optionValue, position: index },
        });
        optionValueIds.set(variant.optionValue, value.id);
      }
    }

    for (const [index, variant] of seed.variants.entries()) {
      const sku = `${seed.sku}-${variant.skuSuffix}`;
      const created = await db.productVariant.upsert({
        where: { sku },
        update: {
          priceMinor: variant.priceDeltaMinor
            ? seed.basePriceMinor + variant.priceDeltaMinor
            : null,
          isActive: true,
        },
        create: {
          productId: product.id,
          sku,
          label: variant.optionValue ? `${seed.optionName} ${variant.optionValue}` : 'One size',
          priceMinor: variant.priceDeltaMinor
            ? seed.basePriceMinor + variant.priceDeltaMinor
            : null,
          compareAtPriceMinor:
            seed.compareAtPriceMinor && variant.priceDeltaMinor
              ? seed.compareAtPriceMinor + variant.priceDeltaMinor
              : null,
          weightGrams: variant.weightGrams ?? null,
          position: index,
        },
      });

      if (variant.optionValue && optionId) {
        const optionValueId = optionValueIds.get(variant.optionValue);
        if (optionValueId) {
          await db.variantOptionValue.upsert({
            where: {
              variantId_optionValueId: { variantId: created.id, optionValueId },
            },
            update: {},
            create: { variantId: created.id, optionValueId },
          });
        }
      }

      await db.inventory.upsert({
        where: { variantId: created.id },
        update: { quantity: variant.quantity },
        create: { variantId: created.id, quantity: variant.quantity, lowStockThreshold: 3 },
      });

      // Price breakup. Replaced wholesale on every seed run so a changed price
      // can never leave last run's components behind — a stale breakdown is
      // silently dropped at render time, which looks like the feature is
      // broken rather than like the data is.
      const exTaxPriceMinor = variant.priceDeltaMinor
        ? seed.basePriceMinor + variant.priceDeltaMinor
        : seed.basePriceMinor;

      const { components, weightGrams } = buildSeedComponents({
        exTaxPriceMinor,
        purity: seed.attributes.purity ?? null,
        metalType: seed.attributes['metal-type'] ?? null,
        stoneType: seed.attributes['stone-type'] ?? null,
        stoneCarats: caratsFromSpecs(seed.specs),
      });

      await db.variantPriceComponent.deleteMany({ where: { variantId: created.id } });
      if (components.length > 0) {
        // Belt and braces: the generator is built to reconcile, and this is
        // what catches it if someone changes it so that it does not.
        assertBreakdownReconciles(components, exTaxPriceMinor);
        await db.variantPriceComponent.createMany({
          data: components.map((component) => ({ ...component, variantId: created.id })),
        });
        // The weight the breakdown charges for is the weight the piece has.
        await db.productVariant.update({
          where: { id: created.id },
          data: { weightGrams },
        });
      }
    }
  }

  console.info(`✓ Products: ${PRODUCTS.length}`);
}

async function seedCommerce(taxonomy: Taxonomy) {
  for (const method of SHIPPING_METHODS) {
    await db.shippingMethod.upsert({
      where: { code: method.code },
      update: {
        name: method.name,
        description: method.description,
        baseRateMinor: method.baseRateMinor,
        freeAboveMinor: method.freeAboveMinor,
        estimatedDaysMin: method.estimatedDaysMin,
        estimatedDaysMax: method.estimatedDaysMax,
        position: method.position,
      },
      create: { ...method },
    });
  }

  const startsAt = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const endsAt = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000);

  for (const coupon of COUPONS) {
    const collectionId =
      'collectionSlug' in coupon && coupon.collectionSlug
        ? (taxonomy.collectionIds.get(coupon.collectionSlug) ?? null)
        : null;

    await db.coupon.upsert({
      where: { code: coupon.code },
      update: {
        description: coupon.description,
        value: coupon.value,
        isActive: true,
        endsAt,
        collectionId,
      },
      create: {
        code: coupon.code,
        description: coupon.description,
        type: coupon.type,
        value: coupon.value,
        minSubtotalMinor: coupon.minSubtotalMinor,
        maxDiscountMinor: coupon.maxDiscountMinor,
        usageLimit: coupon.usageLimit,
        usageLimitPerUser: coupon.usageLimitPerUser,
        startsAt,
        endsAt,
        collectionId,
      },
    });
  }

  console.info(
    `✓ Commerce: ${SHIPPING_METHODS.length} shipping methods, ${COUPONS.length} coupons`,
  );
}

async function main() {
  console.info('Seeding Aurelia…');
  await seedUsers();
  const taxonomy = await seedTaxonomy();
  await seedProducts(taxonomy);
  await seedCommerce(taxonomy);
  console.info('Done.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
