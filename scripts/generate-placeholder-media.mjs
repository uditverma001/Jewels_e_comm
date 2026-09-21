/**
 * Generate local placeholder artwork for the seed catalogue.
 *
 * The seed ships no photography — we have no rights to any — but a store whose
 * every tile is a broken image cannot be evaluated, and pointing the seed at a
 * third-party CDN makes `pnpm dev` depend on someone else's uptime and on
 * outbound network access.
 *
 * These are deliberately quiet: a warm ivory field, a hairline gold rule and
 * the piece's name set in the display face. They read as "photography pending"
 * rather than as a design, so nobody mistakes them for finished artwork.
 *
 * Production points STORAGE_DRIVER at S3/R2 and uses real images; nothing here
 * ships to production.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const OUT_DIR = path.join(process.cwd(), 'public', 'images', 'placeholders');

/** Warm, low-chroma pairs drawn from the site palette. */
const TONES = [
  ['#f6f1e9', '#e7dccb'],
  ['#efe9e2', '#ddd0c0'],
  ['#f4eee6', '#e2d6c6'],
  ['#eeeae4', '#d9cfc2'],
  ['#f2ece3', '#e0d3c2'],
  ['#ece6de', '#d5c9ba'],
];

function escapeXml(value) {
  return value.replace(
    /[<>&'"]/g,
    (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[char],
  );
}

function wrap(text, maxChars) {
  const words = text.split(' ');
  const lines = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export function buildSvg({ title, subtitle, index, width = 1200, height = 1500 }) {
  const [from, to] = TONES[index % TONES.length];
  const lines = wrap(title, 18);
  const startY = height / 2 - ((lines.length - 1) * 74) / 2;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(title)}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0.35" y2="1">
      <stop offset="0%" stop-color="${from}"/>
      <stop offset="100%" stop-color="${to}"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="38%" r="46%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="${width}" height="${height}" fill="url(#bg)"/>
  <rect width="${width}" height="${height}" fill="url(#glow)"/>
  <rect x="44" y="44" width="${width - 88}" height="${height - 88}" fill="none" stroke="#b79b62" stroke-opacity="0.34" stroke-width="1.5"/>

  <g fill="#3a332b" font-family="Georgia, 'Times New Roman', serif" text-anchor="middle">
${lines
  .map(
    (line, i) =>
      `    <text x="${width / 2}" y="${startY + i * 74}" font-size="62" font-weight="300">${escapeXml(line)}</text>`,
  )
  .join('\n')}
  </g>

  <text x="${width / 2}" y="${startY + lines.length * 74 + 34}" fill="#8a7a63"
        font-family="Helvetica, Arial, sans-serif" font-size="23" letter-spacing="7"
        text-anchor="middle">${escapeXml(subtitle.toUpperCase())}</text>

  <text x="${width / 2}" y="${height - 76}" fill="#a3947e"
        font-family="Helvetica, Arial, sans-serif" font-size="19" letter-spacing="5"
        text-anchor="middle">PHOTOGRAPHY PENDING</text>
</svg>
`;
}

async function main() {
  const { PRODUCTS, CATEGORIES, COLLECTIONS } = await import('../prisma/seed-data.ts');
  await mkdir(OUT_DIR, { recursive: true });

  let written = 0;

  for (const [index, product] of PRODUCTS.entries()) {
    for (let view = 0; view < product.images.length; view += 1) {
      const svg = buildSvg({
        title: product.name,
        subtitle: `View ${view + 1}`,
        index: index + view,
      });
      await writeFile(path.join(OUT_DIR, `${product.sku.toLowerCase()}-${view + 1}.svg`), svg);
      written += 1;
    }
  }

  for (const [index, category] of CATEGORIES.entries()) {
    await writeFile(
      path.join(OUT_DIR, `category-${category.slug}.svg`),
      buildSvg({ title: category.name, subtitle: 'Category', index, width: 1200, height: 1500 }),
    );
    written += 1;
  }

  for (const [index, collection] of COLLECTIONS.entries()) {
    await writeFile(
      path.join(OUT_DIR, `collection-${collection.slug}.svg`),
      buildSvg({
        title: collection.name,
        subtitle: 'Collection',
        index: index + 2,
        width: 1600,
        height: 1000,
      }),
    );
    written += 1;
  }

  await writeFile(
    path.join(OUT_DIR, 'hero.svg'),
    buildSvg({ title: 'Aurelia', subtitle: 'Fine jewellery', index: 3, width: 2000, height: 1200 }),
  );
  written += 1;

  console.info(`Wrote ${written} placeholder images to public/images/placeholders`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
