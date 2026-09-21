/**
 * Seed catalogue.
 *
 * Deliberately realistic rather than lorem ipsum: prices, purities, weights and
 * stone details are plausible for the Indian market, so the storefront can be
 * judged the way a customer would see it. Imagery points at Unsplash so the
 * repository carries no binaries.
 */

export interface SeedVariant {
  optionValue: string | null;
  skuSuffix: string;
  priceDeltaMinor?: number;
  weightGrams?: number;
  quantity: number;
}

export interface SeedProduct {
  name: string;
  sku: string;
  category: string;
  collection?: string;
  brand: string;
  audience: 'WOMEN' | 'MEN' | 'UNISEX' | 'KIDS';
  basePriceMinor: number;
  compareAtPriceMinor?: number;
  shortDescription: string;
  description: string;
  careInstructions: string;
  tags: string[];
  attributes: Record<string, string>;
  specs: { label: string; value: string }[];
  /** How many placeholder/production views this piece has. */
  imageCount: number;
  optionName?: string;
  variants: SeedVariant[];
  isFeatured?: boolean;
  isBestSeller?: boolean;
}

/**
 * Seed imagery.
 *
 * Defaults to the locally generated placeholders in `public/images/placeholders`
 * so the storefront renders with no outbound network and no third-party
 * dependency. Point `SEED_IMAGE_BASE_URL` at a real CDN to seed with actual
 * photography; the app itself always reads image URLs from the database and
 * never hard-codes a host.
 */
const IMAGE_BASE = process.env.SEED_IMAGE_BASE_URL?.replace(/\/$/, '') ?? null;

export const productImage = (sku: string, view: number): string =>
  IMAGE_BASE
    ? `${IMAGE_BASE}/products/${sku.toLowerCase()}-${view}.jpg`
    : `/images/placeholders/${sku.toLowerCase()}-${view}.svg`;

export const categoryImage = (slug: string): string =>
  IMAGE_BASE ? `${IMAGE_BASE}/categories/${slug}.jpg` : `/images/placeholders/category-${slug}.svg`;

export const collectionImage = (slug: string): string =>
  IMAGE_BASE
    ? `${IMAGE_BASE}/collections/${slug}.jpg`
    : `/images/placeholders/collection-${slug}.svg`;

export const heroImage = (): string =>
  IMAGE_BASE ? `${IMAGE_BASE}/hero.jpg` : '/images/placeholders/hero.svg';

export const CATEGORIES = [
  {
    name: 'Rings',
    slug: 'rings',
    description:
      'From solitaire engagement rings to everyday stacking bands, each ring is hand-set and finished in our Mumbai atelier.',
    imageUrl: categoryImage('rings'),
    children: [
      { name: 'Engagement Rings', slug: 'engagement-rings' },
      { name: 'Everyday Bands', slug: 'everyday-bands' },
      { name: 'Cocktail Rings', slug: 'cocktail-rings' },
    ],
  },
  {
    name: 'Necklaces',
    slug: 'necklaces',
    description:
      'Pendants, chains and statement necklaces in 18K and 22K gold, designed to layer and to last.',
    imageUrl: categoryImage('necklaces'),
    children: [
      { name: 'Pendants', slug: 'pendants' },
      { name: 'Chains', slug: 'chains' },
    ],
  },
  {
    name: 'Earrings',
    slug: 'earrings',
    description: 'Studs, hoops and jhumkas — the pieces you reach for without thinking.',
    imageUrl: categoryImage('earrings'),
    children: [
      { name: 'Studs', slug: 'studs' },
      { name: 'Hoops', slug: 'hoops' },
      { name: 'Jhumkas', slug: 'jhumkas' },
    ],
  },
  {
    name: 'Bracelets',
    slug: 'bracelets',
    description: 'Tennis bracelets, kadas and chain bracelets, sized to sit properly on the wrist.',
    imageUrl: categoryImage('bracelets'),
    children: [
      { name: 'Tennis Bracelets', slug: 'tennis-bracelets' },
      { name: 'Bangles', slug: 'bangles' },
    ],
  },
  {
    name: 'Mangalsutra',
    slug: 'mangalsutra',
    description: 'Contemporary and traditional mangalsutra, in black bead and gold.',
    imageUrl: categoryImage('mangalsutra'),
    children: [],
  },
] as const;

export const COLLECTIONS = [
  {
    name: 'Bridal',
    slug: 'bridal',
    description:
      'Heirloom-grade pieces for the ceremony and everything around it — certified diamonds, 22K gold, and settings built to be worn for decades.',
    heroImageUrl: collectionImage('bridal'),
    isFeatured: true,
    position: 1,
  },
  {
    name: 'Everyday Fine',
    slug: 'everyday-fine',
    description:
      'Light, secure and quietly luxurious. Designed to go from a desk to dinner without a second thought.',
    heroImageUrl: collectionImage('everyday-fine'),
    isFeatured: true,
    position: 2,
  },
  {
    name: 'Heritage',
    slug: 'heritage',
    description:
      'Temple work, kundan and meenakari, made by craftspeople we have worked with for three generations.',
    heroImageUrl: collectionImage('heritage'),
    isFeatured: true,
    position: 3,
  },
  {
    name: 'Men',
    slug: 'men',
    description: 'Restrained, substantial pieces in gold and platinum.',
    heroImageUrl: collectionImage('men'),
    isFeatured: false,
    position: 4,
  },
] as const;

export const BRANDS = [
  { name: 'Aurelia Atelier', slug: 'aurelia-atelier', description: 'Our in-house workshop.' },
  { name: 'Mirai', slug: 'mirai', description: 'Minimal fine jewellery, made in Jaipur.' },
  { name: 'Roshni', slug: 'roshni', description: 'Traditional craftsmanship, contemporary scale.' },
] as const;

export const ATTRIBUTES = [
  {
    code: 'metal-type',
    name: 'Metal',
    values: ['Yellow Gold', 'White Gold', 'Rose Gold', 'Platinum', 'Sterling Silver'],
  },
  { code: 'purity', name: 'Purity', values: ['14K', '18K', '22K', '24K', 'PT950', '925 Silver'] },
  {
    code: 'stone-type',
    name: 'Stone',
    values: ['Diamond', 'Ruby', 'Emerald', 'Sapphire', 'Pearl', 'Polki', 'No Stone'],
  },
  { code: 'material', name: 'Craft', values: ['Handcrafted', 'Machine Finished', 'Temple Work'] },
  { code: 'size', name: 'Size', values: ['Small', 'Medium', 'Large', 'Adjustable'] },
] as const;

export const PRODUCTS: SeedProduct[] = [
  {
    name: 'Aurora Solitaire Ring',
    sku: 'AUR-RNG-0001',
    category: 'engagement-rings',
    collection: 'bridal',
    brand: 'aurelia-atelier',
    audience: 'WOMEN',
    basePriceMinor: 18_499_900,
    compareAtPriceMinor: 21_999_900,
    shortDescription: 'A 0.70ct brilliant-cut solitaire in an 18K white gold six-prong setting.',
    description:
      'The Aurora is our most-requested engagement ring, and the reason is the setting: six slim prongs lift the stone high enough to catch light from beneath, without the snag of a taller crown. The band tapers from 2.1mm at the shoulder to 1.8mm at the base so it sits flush against a wedding band.\n\nEvery centre stone is IGI certified and hand-selected for a colour grade of G or better. The certificate travels with the ring.',
    careInstructions:
      'Remove before swimming, gardening or applying hand cream. Clean with warm water, a drop of mild soap and a soft brush. We re-tip prongs and re-polish free of charge, for life.',
    tags: ['engagement', 'solitaire', 'diamond', 'bridal', 'gift'],
    attributes: {
      'metal-type': 'White Gold',
      purity: '18K',
      'stone-type': 'Diamond',
      material: 'Handcrafted',
    },
    specs: [
      { label: 'Centre stone', value: '0.70ct brilliant cut, IGI certified' },
      { label: 'Colour / Clarity', value: 'G / VS1' },
      { label: 'Setting', value: 'Six-prong, cathedral shoulder' },
      { label: 'Band width', value: '1.8 – 2.1 mm' },
      { label: 'Hallmark', value: 'BIS 750' },
    ],
    imageCount: 3,
    optionName: 'Ring Size',
    variants: [
      { optionValue: '6', skuSuffix: '06', weightGrams: 2.9, quantity: 4 },
      { optionValue: '7', skuSuffix: '07', weightGrams: 3.1, quantity: 6 },
      { optionValue: '8', skuSuffix: '08', weightGrams: 3.3, priceDeltaMinor: 60_000, quantity: 3 },
      {
        optionValue: '9',
        skuSuffix: '09',
        weightGrams: 3.5,
        priceDeltaMinor: 120_000,
        quantity: 0,
      },
    ],
    isFeatured: true,
    isBestSeller: true,
  },
  {
    name: 'Meena Temple Jhumka',
    sku: 'AUR-EAR-0002',
    category: 'jhumkas',
    collection: 'heritage',
    brand: 'roshni',
    audience: 'WOMEN',
    basePriceMinor: 9_875_000,
    shortDescription: 'Hand-painted meenakari jhumkas in 22K gold with uncut polki accents.',
    description:
      'Made over eleven days by a family workshop in Jaipur that has done meena work for three generations. The enamel is fired in four passes — peacock blue, then white, then the red that gives the dome its depth — and the polki is set last so the heat never touches it.\n\nThe hook is a screw-back, which we insist on at this weight. A jhumka that pulls on the lobe is a jhumka that stays in a drawer.',
    careInstructions:
      'Store flat in the pouch provided; enamel chips if it knocks against other pieces. Never use ultrasonic cleaners. Wipe with a dry cloth only.',
    tags: ['jhumka', 'temple', 'polki', 'wedding', 'traditional'],
    attributes: {
      'metal-type': 'Yellow Gold',
      purity: '22K',
      'stone-type': 'Polki',
      material: 'Temple Work',
    },
    specs: [
      { label: 'Technique', value: 'Meenakari enamel, four-pass firing' },
      { label: 'Stones', value: 'Uncut polki, 1.2ct total' },
      { label: 'Back', value: 'Screw-back with comfort pad' },
      { label: 'Drop length', value: '52 mm' },
      { label: 'Hallmark', value: 'BIS 916' },
    ],
    imageCount: 3,
    variants: [{ optionValue: null, skuSuffix: 'STD', weightGrams: 14.6, quantity: 5 }],
    isFeatured: true,
  },
  {
    name: 'Linea Tennis Bracelet',
    sku: 'AUR-BRC-0003',
    category: 'tennis-bracelets',
    collection: 'everyday-fine',
    brand: 'mirai',
    audience: 'WOMEN',
    basePriceMinor: 24_500_000,
    compareAtPriceMinor: 28_000_000,
    shortDescription: '3.2ct of graduated brilliants in a 18K white gold four-prong line setting.',
    description:
      'Fifty-two stones, graduated from 3.4mm at the clasp to 2.6mm at the centre, so the bracelet reads as a continuous line of light rather than a row of individual stones. Each link is articulated, which is what lets it lie flat on the wrist instead of standing proud.\n\nThe clasp is a box-and-tongue with a figure-eight safety — the only closure we will use on a piece at this value.',
    careInstructions:
      'Have the clasp and safety checked annually; we do it free. Clean with warm soapy water and a soft brush, paying attention to the underside of each setting.',
    tags: ['tennis', 'diamond', 'bracelet', 'gift', 'anniversary'],
    attributes: {
      'metal-type': 'White Gold',
      purity: '18K',
      'stone-type': 'Diamond',
      material: 'Handcrafted',
    },
    specs: [
      { label: 'Total carat', value: '3.20ct' },
      { label: 'Stone count', value: '52 brilliants' },
      { label: 'Colour / Clarity', value: 'F–G / VS' },
      { label: 'Clasp', value: 'Box with figure-eight safety' },
    ],
    imageCount: 3,
    optionName: 'Length',
    variants: [
      { optionValue: 'Small (16 cm)', skuSuffix: 'S', weightGrams: 9.8, quantity: 2 },
      { optionValue: 'Medium (17.5 cm)', skuSuffix: 'M', weightGrams: 10.4, quantity: 4 },
      {
        optionValue: 'Large (19 cm)',
        skuSuffix: 'L',
        weightGrams: 11.1,
        priceDeltaMinor: 450_000,
        quantity: 1,
      },
    ],
    isBestSeller: true,
  },
  {
    name: 'Kiran Layering Chain',
    sku: 'AUR-NCK-0004',
    category: 'chains',
    collection: 'everyday-fine',
    brand: 'mirai',
    audience: 'UNISEX',
    basePriceMinor: 3_299_900,
    shortDescription: 'A 1.4mm 18K rope chain that holds its shape under a pendant.',
    description:
      'Most fine chains at this price are hollow. This one is not, which is why it can carry a pendant without kinking and why it costs a little more. The rope twist is machine-laid and then hand-finished at the clasp.\n\nIt is the chain we recommend when someone wants one necklace to wear every day for ten years.',
    careInstructions:
      'Take it off before sleeping; a chain worn overnight is the most common cause of a broken link. Clean with a soft cloth.',
    tags: ['chain', 'everyday', 'layering', 'unisex', 'gift'],
    attributes: {
      'metal-type': 'Yellow Gold',
      purity: '18K',
      'stone-type': 'No Stone',
      material: 'Machine Finished',
    },
    specs: [
      { label: 'Gauge', value: '1.4 mm solid rope' },
      { label: 'Clasp', value: 'Lobster, 9 mm' },
      { label: 'Hallmark', value: 'BIS 750' },
    ],
    imageCount: 3,
    optionName: 'Length',
    variants: [
      { optionValue: '40 cm', skuSuffix: '40', weightGrams: 3.2, quantity: 12 },
      {
        optionValue: '45 cm',
        skuSuffix: '45',
        weightGrams: 3.6,
        priceDeltaMinor: 280_000,
        quantity: 18,
      },
      {
        optionValue: '50 cm',
        skuSuffix: '50',
        weightGrams: 4.0,
        priceDeltaMinor: 560_000,
        quantity: 9,
      },
    ],
    isBestSeller: true,
  },
  {
    name: 'Anaya Diamond Stud',
    sku: 'AUR-EAR-0005',
    category: 'studs',
    collection: 'everyday-fine',
    brand: 'aurelia-atelier',
    audience: 'WOMEN',
    basePriceMinor: 6_450_000,
    shortDescription: 'Matched 0.25ct brilliants, four-prong, in 18K white gold.',
    description:
      'Studs are the hardest thing to buy well, because the difference between a good pair and a mediocre pair is invisible in a photograph. Ours are matched as a pair for colour and cut before they are set, and the posts are 0.9mm — slightly thicker than standard, so they do not bend.\n\nThe backs are push-on with a friction groove; screw-backs are available on request at no extra cost.',
    careInstructions: 'Clean weekly with warm soapy water. Check the backs monthly.',
    tags: ['studs', 'diamond', 'everyday', 'gift', 'classic'],
    attributes: {
      'metal-type': 'White Gold',
      purity: '18K',
      'stone-type': 'Diamond',
      material: 'Handcrafted',
    },
    specs: [
      { label: 'Total carat', value: '0.50ct (0.25ct each)' },
      { label: 'Colour / Clarity', value: 'G / VS2' },
      { label: 'Post', value: '0.9 mm, push-back' },
    ],
    imageCount: 2,
    variants: [{ optionValue: null, skuSuffix: 'STD', weightGrams: 1.8, quantity: 22 }],
    isFeatured: true,
    isBestSeller: true,
  },
  {
    name: 'Vaani Emerald Pendant',
    sku: 'AUR-NCK-0006',
    category: 'pendants',
    collection: 'heritage',
    brand: 'roshni',
    audience: 'WOMEN',
    basePriceMinor: 14_200_000,
    compareAtPriceMinor: 16_500_000,
    shortDescription: 'A 2.1ct Zambian emerald framed by a halo of 0.35ct brilliants.',
    description:
      'The emerald is Zambian rather than Colombian — a deeper, slightly cooler green, and considerably more durable, which matters for a stone that will be worn against the collarbone. It is set in a closed-back bezel to protect the girdle.\n\nSupplied on a 45cm 18K cable chain, which can be exchanged for any of our chains at no cost within 30 days.',
    careInstructions:
      'Emerald is softer than diamond and is almost always oiled. Never use an ultrasonic or steam cleaner. Wipe with a damp cloth only.',
    tags: ['emerald', 'pendant', 'heritage', 'statement'],
    attributes: {
      'metal-type': 'Yellow Gold',
      purity: '22K',
      'stone-type': 'Emerald',
      material: 'Handcrafted',
    },
    specs: [
      { label: 'Centre stone', value: '2.10ct Zambian emerald' },
      { label: 'Halo', value: '0.35ct brilliants' },
      { label: 'Setting', value: 'Closed-back bezel' },
      { label: 'Chain', value: '45 cm 18K cable, included' },
    ],
    imageCount: 2,
    variants: [{ optionValue: null, skuSuffix: 'STD', weightGrams: 7.4, quantity: 3 }],
    isFeatured: true,
  },
  {
    name: 'Ravi Signet Ring',
    sku: 'AUR-RNG-0007',
    category: 'everyday-bands',
    collection: 'men',
    brand: 'aurelia-atelier',
    audience: 'MEN',
    basePriceMinor: 8_900_000,
    shortDescription: 'A solid 22K signet with a brushed face, ready for engraving.',
    description:
      'Substantial without being ostentatious: 11g of solid 22K, a 14mm oval face brushed rather than polished so it does not mirror every light in the room. The shank is squared on the inside, which stops it spinning on the finger.\n\nHand engraving is included — initials, a monogram or a family seal. Allow ten working days.',
    careInstructions:
      'The brushed finish will soften into a patina. We re-brush it free of charge whenever you want it back to new.',
    tags: ['signet', 'men', 'gold', 'engraving'],
    attributes: {
      'metal-type': 'Yellow Gold',
      purity: '22K',
      'stone-type': 'No Stone',
      material: 'Handcrafted',
    },
    specs: [
      { label: 'Face', value: '14 × 12 mm oval, brushed' },
      { label: 'Weight', value: '≈ 11 g' },
      { label: 'Engraving', value: 'Hand engraved, included' },
      { label: 'Hallmark', value: 'BIS 916' },
    ],
    imageCount: 2,
    optionName: 'Ring Size',
    variants: [
      { optionValue: '9', skuSuffix: '09', weightGrams: 10.8, quantity: 3 },
      { optionValue: '10', skuSuffix: '10', weightGrams: 11.2, quantity: 5 },
      {
        optionValue: '11',
        skuSuffix: '11',
        weightGrams: 11.7,
        priceDeltaMinor: 180_000,
        quantity: 2,
      },
    ],
  },
  {
    name: 'Saanjh Mangalsutra',
    sku: 'AUR-MNG-0008',
    category: 'mangalsutra',
    collection: 'bridal',
    brand: 'roshni',
    audience: 'WOMEN',
    basePriceMinor: 5_780_000,
    shortDescription: 'A contemporary short mangalsutra: black beads, 18K gold, 0.18ct pavé.',
    description:
      'Designed for women who wear their mangalsutra every day and want one that sits under a collar. The bead work is double-strand at the back and single at the front, so the pendant stays centred without a heavy chain.\n\nThe pavé is set into a slim vertical bar rather than a traditional pendant, which reads as modern without abandoning the form.',
    careInstructions:
      'Black beads are glass and will dull with perfume. Apply fragrance first, then put the piece on.',
    tags: ['mangalsutra', 'bridal', 'everyday', 'diamond'],
    attributes: {
      'metal-type': 'Yellow Gold',
      purity: '18K',
      'stone-type': 'Diamond',
      material: 'Handcrafted',
    },
    specs: [
      { label: 'Length', value: '46 cm' },
      { label: 'Pavé', value: '0.18ct, 22 stones' },
      { label: 'Bead', value: 'Double strand rear, single front' },
    ],
    imageCount: 2,
    variants: [{ optionValue: null, skuSuffix: 'STD', weightGrams: 8.1, quantity: 7 }],
    isBestSeller: true,
  },
  {
    name: 'Ira Pearl Drop Earring',
    sku: 'AUR-EAR-0009',
    category: 'hoops',
    collection: 'everyday-fine',
    brand: 'mirai',
    audience: 'WOMEN',
    basePriceMinor: 2_450_000,
    compareAtPriceMinor: 2_990_000,
    shortDescription: 'Freshwater baroque pearls on a slim 14K hoop.',
    description:
      'Baroque pearls are chosen, not matched — every pair is slightly different, which is the point. The hoop is 14K rather than 18K here because a lighter alloy holds a thin 1mm section better over time.\n\nThe pearl is removable: twist the hoop open and you have a plain 22mm hoop for the days you want one.',
    careInstructions:
      'Pearls are porous. Wipe after wearing, never soak, and store away from direct sunlight.',
    tags: ['pearl', 'hoops', 'everyday', 'gift'],
    attributes: {
      'metal-type': 'Yellow Gold',
      purity: '14K',
      'stone-type': 'Pearl',
      material: 'Handcrafted',
    },
    specs: [
      { label: 'Pearl', value: '8–9 mm freshwater baroque' },
      { label: 'Hoop', value: '22 mm, 1 mm section' },
      { label: 'Closure', value: 'Hinged snap' },
    ],
    imageCount: 2,
    variants: [{ optionValue: null, skuSuffix: 'STD', weightGrams: 2.6, quantity: 15 }],
  },
  {
    name: 'Devi Kada Bangle',
    sku: 'AUR-BRC-0010',
    category: 'bangles',
    collection: 'heritage',
    brand: 'roshni',
    audience: 'UNISEX',
    basePriceMinor: 16_900_000,
    shortDescription: 'A solid 22K kada with hand-chased temple motifs.',
    description:
      'Chased by hand, not cast — which you can see on the inner edge, where the tool marks are left deliberately visible. The motif is a repeating lotus that the workshop has used since the 1960s.\n\nAt 22K this is soft gold and will mark. That is the nature of a kada worn daily, and we consider it the best thing about it.',
    careInstructions:
      'Expect surface marks; they are part of the piece. We re-chase and re-polish on request.',
    tags: ['kada', 'bangle', 'temple', 'heritage', 'gold'],
    attributes: {
      'metal-type': 'Yellow Gold',
      purity: '22K',
      'stone-type': 'No Stone',
      material: 'Temple Work',
    },
    specs: [
      { label: 'Width', value: '9 mm' },
      { label: 'Weight', value: '≈ 22 g' },
      { label: 'Finish', value: 'Hand chased' },
      { label: 'Hallmark', value: 'BIS 916' },
    ],
    imageCount: 2,
    optionName: 'Size',
    variants: [
      { optionValue: '2.4', skuSuffix: '24', weightGrams: 21.2, quantity: 2 },
      { optionValue: '2.6', skuSuffix: '26', weightGrams: 22.4, quantity: 4 },
      {
        optionValue: '2.8',
        skuSuffix: '28',
        weightGrams: 23.8,
        priceDeltaMinor: 780_000,
        quantity: 0,
      },
    ],
  },
  {
    name: 'Noor Platinum Band',
    sku: 'AUR-RNG-0011',
    category: 'everyday-bands',
    collection: 'bridal',
    brand: 'aurelia-atelier',
    audience: 'UNISEX',
    basePriceMinor: 11_250_000,
    shortDescription: 'A 3mm court-profile PT950 wedding band with a satin finish.',
    description:
      'Platinum does not wear away, it displaces — so a platinum band gets a patina rather than getting thinner. Over twenty years that difference is measured in grams.\n\nThe court profile is rounded inside and out, which is the most comfortable shape for a band worn continuously. Satin finish as standard; we will polish it on request.',
    careInstructions: 'Almost none required. Bring it in annually and we will re-satin it free.',
    tags: ['wedding', 'platinum', 'band', 'unisex', 'bridal'],
    attributes: {
      'metal-type': 'Platinum',
      purity: 'PT950',
      'stone-type': 'No Stone',
      material: 'Machine Finished',
    },
    specs: [
      { label: 'Profile', value: 'Court, 3 mm × 1.8 mm' },
      { label: 'Metal', value: 'PT950' },
      { label: 'Finish', value: 'Satin' },
    ],
    imageCount: 2,
    optionName: 'Ring Size',
    variants: [
      { optionValue: '6', skuSuffix: '06', weightGrams: 4.1, quantity: 6 },
      { optionValue: '8', skuSuffix: '08', weightGrams: 4.6, quantity: 8 },
      {
        optionValue: '10',
        skuSuffix: '10',
        weightGrams: 5.2,
        priceDeltaMinor: 340_000,
        quantity: 5,
      },
    ],
  },
  {
    name: 'Tara Ruby Cocktail Ring',
    sku: 'AUR-RNG-0012',
    category: 'cocktail-rings',
    collection: 'heritage',
    brand: 'roshni',
    audience: 'WOMEN',
    basePriceMinor: 21_800_000,
    shortDescription: 'A 3.4ct Burmese ruby in a 22K gold cushion setting with polki shoulders.',
    description:
      'An unapologetically large ring. The ruby is Burmese, heat-treated only, with the slightly blue-leaning red that distinguishes the origin. It sits in a cushion bezel that protects the corners — the vulnerable part of any cushion cut.\n\nThe shoulders are set with uncut polki rather than brilliants, which keeps the eye on the centre stone instead of competing with it.',
    careInstructions:
      'Ruby is durable but the polki is not. No ultrasonic cleaning. Soft cloth only.',
    tags: ['ruby', 'cocktail', 'statement', 'heritage', 'polki'],
    attributes: {
      'metal-type': 'Yellow Gold',
      purity: '22K',
      'stone-type': 'Ruby',
      material: 'Temple Work',
    },
    specs: [
      { label: 'Centre stone', value: '3.40ct Burmese ruby, heat only' },
      { label: 'Shoulders', value: 'Uncut polki, 0.55ct' },
      { label: 'Setting', value: 'Cushion bezel' },
    ],
    imageCount: 2,
    optionName: 'Ring Size',
    variants: [
      { optionValue: '7', skuSuffix: '07', weightGrams: 12.4, quantity: 1 },
      { optionValue: '8', skuSuffix: '08', weightGrams: 12.9, quantity: 2 },
    ],
    isFeatured: true,
  },
];

export const SHIPPING_METHODS = [
  {
    code: 'standard',
    name: 'Standard delivery',
    description: 'Insured and signature-required. Free on orders above ₹50,000.',
    baseRateMinor: 25_000,
    freeAboveMinor: 5_000_000,
    estimatedDaysMin: 4,
    estimatedDaysMax: 7,
    position: 1,
  },
  {
    code: 'express',
    name: 'Express delivery',
    description: 'Insured, signature-required, dispatched the same working day.',
    baseRateMinor: 60_000,
    freeAboveMinor: null,
    estimatedDaysMin: 2,
    estimatedDaysMax: 3,
    position: 2,
  },
  {
    code: 'white-glove',
    name: 'White glove',
    description: 'Hand-delivered by appointment in Mumbai, Delhi NCR and Bengaluru.',
    baseRateMinor: 150_000,
    freeAboveMinor: 20_000_000,
    estimatedDaysMin: 1,
    estimatedDaysMax: 2,
    position: 3,
  },
] as const;

export const COUPONS = [
  {
    code: 'WELCOME10',
    description: '10% off your first order, up to ₹5,000.',
    type: 'PERCENTAGE' as const,
    value: 1000,
    minSubtotalMinor: 1_000_000,
    maxDiscountMinor: 500_000,
    usageLimitPerUser: 1,
    usageLimit: null,
  },
  {
    code: 'FREESHIP',
    description: 'Free standard shipping on any order.',
    type: 'FREE_SHIPPING' as const,
    value: 0,
    minSubtotalMinor: 0,
    maxDiscountMinor: null,
    usageLimitPerUser: 5,
    usageLimit: 1000,
  },
  {
    code: 'BRIDAL5000',
    description: '₹5,000 off bridal pieces over ₹1,00,000.',
    type: 'FIXED_AMOUNT' as const,
    value: 500_000,
    minSubtotalMinor: 10_000_000,
    maxDiscountMinor: null,
    usageLimitPerUser: 2,
    usageLimit: 200,
    collectionSlug: 'bridal',
  },
];
