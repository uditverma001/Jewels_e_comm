/**
 * Editorial content.
 *
 * Kept in the repository rather than the database on purpose: these pages
 * change a few times a year, they are reviewed like code, and putting them
 * behind a CMS would add a service and a cache layer for no editorial benefit.
 * When marketing needs to edit them without a deploy, this is the seam to
 * replace.
 */

export interface ContentSection {
  heading: string;
  body: string[];
}

export interface ContentPage {
  slug: string;
  title: string;
  summary: string;
  sections: ContentSection[];
  updatedAt: string;
}

export const HELP_PAGES: ContentPage[] = [
  {
    slug: 'shipping',
    title: 'Shipping & delivery',
    summary:
      'How we pack, insure and deliver your order, and what to expect once it leaves the workshop.',
    updatedAt: '2026-01-15',
    sections: [
      {
        heading: 'Where we deliver',
        body: [
          'We ship anywhere in India. Every parcel is fully insured for its full value while it is in transit and requires a signature on delivery — we will not leave jewellery with a neighbour or in a safe place.',
          'We do not currently ship outside India. If you are ordering from abroad for delivery to an Indian address, that works normally.',
        ],
      },
      {
        heading: 'Cost and timing',
        body: [
          'Standard delivery is ₹250 and takes four to seven working days. It is free on orders above ₹50,000.',
          'Express delivery is ₹600 and takes two to three working days, dispatched the same working day if you order before 2pm.',
          'White glove delivery is ₹1,500 and is hand-delivered by appointment in Mumbai, Delhi NCR and Bengaluru. It is free on orders above ₹2,00,000.',
        ],
      },
      {
        heading: 'Made to order and engraving',
        body: [
          'Pieces that are engraved, resized or made to order add seven to ten working days before dispatch. The product page says so before you buy, and your confirmation email repeats the expected date.',
        ],
      },
      {
        heading: 'Tracking',
        body: [
          'You will get an email with a tracking number as soon as your order is handed to the carrier. If you have an account, the tracking also appears on the order in your account area.',
        ],
      },
    ],
  },
  {
    slug: 'returns',
    title: 'Returns & exchanges',
    summary: 'Fifteen days to change your mind, and free resizing for the first year.',
    updatedAt: '2026-01-15',
    sections: [
      {
        heading: 'The short version',
        body: [
          'You have fifteen days from delivery to return anything unworn, in its original box, with its certificate. We refund to the original payment method within five working days of the piece reaching us.',
        ],
      },
      {
        heading: 'What we cannot take back',
        body: [
          'Engraved pieces and pieces made to your specification cannot be returned, because we cannot sell them to anyone else. This is stated on the product page before you order.',
          'A piece that has been worn, altered by another jeweller, or returned without its certificate cannot be refunded. We will tell you before we send it back to you.',
        ],
      },
      {
        heading: 'Resizing',
        body: [
          'Ring resizing is free for the first year, once. After that we charge only for the metal. Some settings — full eternity bands in particular — cannot be resized, and we will say so rather than attempt it.',
        ],
      },
      {
        heading: 'How to start a return',
        body: [
          'Open the order in your account and choose "Request a return", or reply to your confirmation email. We will send an insured, prepaid label. Please do not post jewellery uninsured.',
        ],
      },
    ],
  },
  {
    slug: 'care',
    title: 'Jewellery care',
    summary: 'How to keep a piece looking like it did on the day it arrived.',
    updatedAt: '2026-01-15',
    sections: [
      {
        heading: 'Every day',
        body: [
          'Put jewellery on last, after perfume, hairspray and hand cream. Take it off before swimming, gardening, the gym and sleeping — most broken chains break overnight.',
        ],
      },
      {
        heading: 'Cleaning',
        body: [
          'Warm water, a drop of mild washing-up liquid and a soft toothbrush will clean most gold and diamond pieces. Rinse properly and dry with a soft cloth.',
          'Do not do this with emeralds, opals, pearls or anything with enamel. Emeralds are almost always oiled, pearls are porous, and enamel chips. Wipe those with a barely damp cloth instead.',
          'Never use an ultrasonic or steam cleaner at home. They are excellent at loosening stones you did not know were loose.',
        ],
      },
      {
        heading: 'Storage',
        body: [
          'Store pieces separately. Gold is soft, and the fastest way to scratch a polished band is to keep it loose in a box with everything else. The pouch your piece arrived in is there for this.',
        ],
      },
      {
        heading: 'What we do',
        body: [
          'Bring any piece back to us and we will clean it, re-polish it and check the settings, free, for as long as you own it. We recommend once a year for anything worn daily, and we will re-tip worn prongs before a stone is lost rather than after.',
        ],
      },
    ],
  },
  {
    slug: 'sizing',
    title: 'Size guide',
    summary: 'Getting the size right the first time, and what to do if you do not.',
    updatedAt: '2026-01-15',
    sections: [
      {
        heading: 'Rings',
        body: [
          'We use Indian ring sizes. If you know a UK, US or European size, tell us and we will convert it — do not convert it yourself, because the charts disagree with each other.',
          'Measure at the end of the day when your hands are warmest, and measure the finger you will actually wear it on. Fingers on your dominant hand are usually half a size larger.',
          'A ring should need a little effort over the knuckle and should not spin freely once on. If you are between sizes and the band is wide, go up.',
        ],
      },
      {
        heading: 'Bracelets and bangles',
        body: [
          'For a chain bracelet, measure your wrist snugly and add 1.5cm for a comfortable fit, or 1cm if you like it close.',
          'Bangles are sized by internal diameter in inches — 2.4, 2.6 and 2.8 are the common Indian sizes. Measure across the widest part of your hand with the thumb tucked in.',
        ],
      },
      {
        heading: 'Chains',
        body: [
          'A 40cm chain sits at the base of the neck, 45cm sits just below the collarbone, and 50cm sits on the chest. For layering, pick lengths at least 5cm apart so they do not tangle.',
        ],
      },
      {
        heading: 'If it is wrong',
        body: [
          'Resizing is free for the first year. Send it back and we will adjust it — that is a normal part of buying a ring online, not a mistake.',
        ],
      },
    ],
  },
  {
    slug: 'authenticity',
    title: 'Certification & hallmarking',
    summary: 'What the marks inside your piece mean, and what we guarantee.',
    updatedAt: '2026-01-15',
    sections: [
      {
        heading: 'Hallmarking',
        body: [
          'Every gold piece we sell carries a BIS hallmark: 916 for 22K, 750 for 18K, 585 for 14K. The mark is applied by a BIS-recognised assaying centre, not by us.',
          'Platinum carries a PT950 mark and a PGI identification number.',
        ],
      },
      {
        heading: 'Diamonds',
        body: [
          'Any diamond above 0.30ct ships with an IGI certificate, and the certificate number is laser-inscribed on the girdle so the stone and the paper cannot be separated.',
          'Smaller accent stones are not individually certified — no laboratory certifies melee — but they are natural, conflict-free, and graded in-house to the colour and clarity stated on the product page.',
        ],
      },
      {
        heading: 'Coloured stones',
        body: [
          'We state treatments plainly. Almost every emerald on the market is oiled and almost every ruby is heated; we will tell you which, because a stone sold as untreated when it is not is worth a fraction of the price.',
        ],
      },
      {
        heading: 'Our guarantee',
        body: [
          'If any piece is ever shown not to be what we said it was, we will refund it in full, whenever you bought it. That is not a fifteen-day policy.',
        ],
      },
    ],
  },
  {
    slug: 'contact',
    title: 'Contact us',
    summary: 'How to reach a person who can actually help.',
    updatedAt: '2026-01-15',
    sections: [
      {
        heading: 'Customer care',
        body: [
          'Email care@aurelia.example and you will hear back the same working day. Include your order number if you have one — it saves a round trip.',
          'Call +91 22 1234 5678, Monday to Saturday, 10am to 7pm IST.',
        ],
      },
      {
        heading: 'The atelier',
        body: [
          'Kala Ghoda, Mumbai 400001. Open Monday to Saturday, 11am to 7pm. You are welcome to come and look at pieces in person; no appointment is needed unless you want to see something specific, in which case tell us a day ahead so we can have it out.',
        ],
      },
      {
        heading: 'Bespoke and repairs',
        body: [
          'We make one-off pieces and we repair jewellery we did not make. Email us with photographs and we will tell you honestly whether it is worth doing.',
        ],
      },
    ],
  },
];

export const LEGAL_PAGES: ContentPage[] = [
  {
    slug: 'privacy',
    title: 'Privacy policy',
    summary: 'What we collect, why, and what we will never do with it.',
    updatedAt: '2026-01-15',
    sections: [
      {
        heading: 'What we collect',
        body: [
          'To sell you jewellery we need your name, email, phone number and delivery address. If you create an account we store those plus a hash of your password — never the password itself.',
          'We record which pieces you have bought so we can honour warranties and handle returns.',
        ],
      },
      {
        heading: 'Payment details',
        body: [
          'We never see or store your card details. Payments are handled by Razorpay, which is PCI-DSS compliant; we receive only a payment reference, the amount, and whether it succeeded.',
        ],
      },
      {
        heading: 'What we do not do',
        body: [
          'We do not sell your data, and we do not share it with advertisers. The only third parties who receive it are the ones needed to complete your order: our payment processor, our delivery carrier, and our email provider.',
        ],
      },
      {
        heading: 'Your rights',
        body: [
          'You can ask for a copy of everything we hold about you, ask us to correct it, or ask us to delete it. Email care@aurelia.example. We will keep what tax law requires us to keep about completed orders and delete the rest.',
          'You can unsubscribe from marketing email at any time from the link in any message. Order and delivery emails are not marketing and will still be sent.',
        ],
      },
      {
        heading: 'Cookies',
        body: [
          'We use a cookie to keep you signed in, a cookie to remember your bag, and a short-lived cookie during checkout. We do not use advertising or cross-site tracking cookies.',
        ],
      },
    ],
  },
  {
    slug: 'terms',
    title: 'Terms of service',
    summary: 'The agreement between you and Aurelia when you buy from us.',
    updatedAt: '2026-01-15',
    sections: [
      {
        heading: 'Orders',
        body: [
          'Placing an order is an offer to buy. The contract is formed when we confirm your order by email, which is also when we take payment.',
          'If we have made a pricing error we will contact you before dispatch and either honour the price or cancel and refund you in full. We will not quietly ship at the higher price.',
        ],
      },
      {
        heading: 'Prices and tax',
        body: [
          'Prices are in Indian rupees and shown excluding GST, which is added at checkout and itemised on your invoice. GST on jewellery is currently 3%.',
          'The price you are charged is the price calculated at checkout on our servers. If a price changes between adding a piece to your bag and paying, checkout will show you the current price before you pay.',
        ],
      },
      {
        heading: 'Availability',
        body: [
          'Much of what we sell is made in small numbers. Stock is reserved for you while you complete checkout, for fifteen minutes. If payment is not completed in that time the reservation is released and the piece becomes available again.',
        ],
      },
      {
        heading: 'Your account',
        body: [
          'Keep your password to yourself and tell us if you think someone else has it. You can end sessions on other devices at any time from the security page in your account.',
          'We may suspend an account for fraud or abuse. We will tell you why.',
        ],
      },
      {
        heading: 'Liability',
        body: [
          'Nothing here limits your statutory rights under Indian consumer law. Where the law permits us to limit liability, our liability for any order is limited to what you paid for it.',
        ],
      },
      {
        heading: 'Governing law',
        body: [
          'These terms are governed by Indian law, and the courts of Mumbai have jurisdiction.',
        ],
      },
    ],
  },
];

export function findContentPage(group: 'help' | 'legal', slug: string): ContentPage | undefined {
  const pages = group === 'help' ? HELP_PAGES : LEGAL_PAGES;
  return pages.find((page) => page.slug === slug);
}
