#!/usr/bin/env node
/**
 * Seed the Firestore `drops` collection with upcoming 2025/2026 sneaker releases.
 *
 * Uses the OAuth access token stored by `firebase login` — no service account needed.
 * If the token is expired, run `firebase login --reauth` then retry.
 *
 * Usage:
 *   node scripts/seed-drops.mjs
 */

import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const PROJECT_ID = 'sneaker-app-fca1c';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

function getAccessToken() {
  const configPath = join(homedir(), '.config', 'configstore', 'firebase-tools.json');
  try {
    const config = JSON.parse(readFileSync(configPath, 'utf8'));
    const token = config?.tokens?.access_token;
    const expiresAt = config?.tokens?.expires_at ?? 0;
    if (!token) throw new Error('No access_token in firebase-tools config');
    if (Date.now() > expiresAt) {
      console.warn('⚠ Firebase access token may be expired. Run: firebase login --reauth');
    }
    return token;
  } catch (e) {
    throw new Error(`Could not read Firebase CLI credentials: ${e.message}\nRun: firebase login`);
  }
}

/** Convert a plain JS value to a Firestore REST value. */
function toValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } };
  if (typeof v === 'object') return { mapValue: { fields: toFields(v) } };
  return { stringValue: String(v) };
}

function toFields(obj) {
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, toValue(v)]));
}

async function addDoc(collectionPath, data) {
  const token = getAccessToken();
  const url = `${BASE}/${collectionPath}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ fields: toFields(data) }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Firestore POST failed (${res.status}): ${text}`);
  }
  return res.json();
}

const drops = [
  // ── 2025 ──────────────────────────────────────────────────────────────────
  {
    brand: 'Nike',
    name: 'Air Max 1 "86 Big Bubble"',
    sku: 'DQ3989-100',
    colorway: 'White / University Red',
    imageUrl: '',
    retailPrice: 140,
    releaseDate: '2025-05-17',
    releaseTime: '10:00 AM ET',
    where: 'Nike SNKRS, select retailers',
    description: 'Classic Air Max 1 silhouette with the oversized 86 Air bubble.',
    isSoldOut: false,
  },
  {
    brand: 'Jordan',
    name: 'Air Jordan 1 Retro High OG "Black Toe Reimagined"',
    sku: 'DZ5485-106',
    colorway: 'White / Black / Varsity Red',
    imageUrl: '',
    retailPrice: 180,
    releaseDate: '2025-05-24',
    releaseTime: '10:00 AM ET',
    where: 'Nike SNKRS, select retailers',
    description: 'The iconic Black Toe colorway updated with premium materials.',
    isSoldOut: false,
  },
  {
    brand: 'Adidas',
    name: 'Yeezy Boost 350 V2 "Slate"',
    sku: 'GW1229',
    colorway: 'Core Slate / Slate Blue',
    imageUrl: '',
    retailPrice: 230,
    releaseDate: '2025-06-07',
    releaseTime: '9:00 AM ET',
    where: 'adidas.com, Yeezy Supply',
    description: 'Neutral toned 350 V2 with a semi-translucent stripe.',
    isSoldOut: false,
  },
  {
    brand: 'New Balance',
    name: 'New Balance 990v6 "Grey"',
    sku: 'M990GL6',
    colorway: 'Grey / Silver',
    imageUrl: '',
    retailPrice: 200,
    releaseDate: '2025-06-14',
    releaseTime: '9:00 AM ET',
    where: 'newbalance.com, DTLR',
    description: 'The sixth iteration of the 990 continues New Balance\'s "Made in USA" legacy.',
    isSoldOut: false,
  },
  {
    brand: 'Nike',
    name: 'Nike SB Dunk Low "Argon"',
    sku: 'DH7913-400',
    colorway: 'University Blue / White / Flash Crimson',
    imageUrl: '',
    retailPrice: 110,
    releaseDate: '2025-06-21',
    releaseTime: '10:00 AM ET',
    where: 'Nike SB skate shops',
    description: 'Vibrant blue Dunk Low built for the streets and the skatepark.',
    isSoldOut: false,
  },
  {
    brand: 'Jordan',
    name: 'Air Jordan 4 Retro "Bred Reimagined"',
    sku: 'FV5029-006',
    colorway: 'Black / Fire Red / Cement Grey',
    imageUrl: '',
    retailPrice: 215,
    releaseDate: '2025-07-12',
    releaseTime: '10:00 AM ET',
    where: 'Nike SNKRS, select retailers',
    description: 'The Bred 4 returns with premium materials and modern construction.',
    isSoldOut: false,
  },
  {
    brand: 'Adidas',
    name: 'Adidas Samba OG "Core Black"',
    sku: 'B75807',
    colorway: 'Core Black / Cloud White / Dark Gum',
    imageUrl: '',
    retailPrice: 100,
    releaseDate: '2025-07-19',
    releaseTime: '9:00 AM ET',
    where: 'adidas.com, select retailers',
    description: 'The timeless Samba OG in its most iconic colorway.',
    isSoldOut: false,
  },
  {
    brand: 'Nike',
    name: 'Air Force 1 Low "07 LV8"',
    sku: 'DV0788-100',
    colorway: 'White / White',
    imageUrl: '',
    retailPrice: 110,
    releaseDate: '2025-08-02',
    releaseTime: '10:00 AM ET',
    where: 'nike.com, select retailers',
    description: 'Elevated LV8 edition of the classic Air Force 1 Low.',
    isSoldOut: false,
  },
  {
    brand: 'New Balance',
    name: 'New Balance 1906R "Protection Pack Stone"',
    sku: 'M1906RG',
    colorway: 'Stone / Rain Cloud',
    imageUrl: '',
    retailPrice: 160,
    releaseDate: '2025-08-16',
    releaseTime: '9:00 AM ET',
    where: 'newbalance.com, Foot Locker',
    description: 'Protective 1906R silhouette in understated earth tones.',
    isSoldOut: false,
  },
  // ── 2026 ──────────────────────────────────────────────────────────────────
  {
    brand: 'Jordan',
    name: 'Air Jordan 3 Retro "Black Cat"',
    sku: 'CK4344-010',
    colorway: 'Black / Dark Charcoal / Black',
    imageUrl: '',
    retailPrice: 200,
    releaseDate: '2026-01-17',
    releaseTime: '10:00 AM ET',
    where: 'Nike SNKRS, select retailers',
    description: 'The all-black Jordan 3 with stealth nubuck upper and elephant print.',
    isSoldOut: false,
  },
  {
    brand: 'Nike',
    name: 'Air Max 95 "Neon"',
    sku: 'DH8015-001',
    colorway: 'Black / Volt / Black',
    imageUrl: '',
    retailPrice: 175,
    releaseDate: '2026-02-07',
    releaseTime: '10:00 AM ET',
    where: 'Nike SNKRS, select retailers',
    description: 'The legendary Air Max 95 Neon, now in premium materials.',
    isSoldOut: false,
  },
  {
    brand: 'Asics',
    name: 'Asics Gel-Kayano 14 "White Silver"',
    sku: '1201A019-104',
    colorway: 'White / Pure Silver',
    imageUrl: '',
    retailPrice: 120,
    releaseDate: '2026-02-14',
    releaseTime: '8:00 AM ET',
    where: 'asics.com, select retailers',
    description: 'Y2K-inspired runner with maximum cushioning and retro styling.',
    isSoldOut: false,
  },
  {
    brand: 'Adidas',
    name: 'Adidas Campus 00s "Wonder White"',
    sku: 'HQ8707',
    colorway: 'Wonder White / Off White',
    imageUrl: '',
    retailPrice: 100,
    releaseDate: '2026-03-07',
    releaseTime: '9:00 AM ET',
    where: 'adidas.com, Foot Locker',
    description: 'The retro Campus silhouette with chunky low-profile sole.',
    isSoldOut: false,
  },
  {
    brand: 'Jordan',
    name: 'Air Jordan 1 Retro High OG "UNC"',
    sku: '555088-117',
    colorway: 'White / University Blue / White',
    imageUrl: '',
    retailPrice: 180,
    releaseDate: '2026-03-28',
    releaseTime: '10:00 AM ET',
    where: 'Nike SNKRS, select retailers',
    description: 'The UNC colorway Jordan 1 celebrating the legacy of Michael Jordan\'s college days.',
    isSoldOut: false,
  },
  {
    brand: 'New Balance',
    name: 'New Balance 2002R "Sea Salt"',
    sku: 'M2002RSC',
    colorway: 'Sea Salt / Cream',
    imageUrl: '',
    retailPrice: 150,
    releaseDate: '2026-04-11',
    releaseTime: '9:00 AM ET',
    where: 'newbalance.com, select retailers',
    description: 'Premium 2002R with nubuck and mesh uppers in coastal tones.',
    isSoldOut: false,
  },
  {
    brand: 'Nike',
    name: 'Air Jordan 11 Retro "Bred"',
    sku: '378037-061',
    colorway: 'Black / Varsity Red / White',
    imageUrl: '',
    retailPrice: 220,
    releaseDate: '2026-05-16',
    releaseTime: '10:00 AM ET',
    where: 'Nike SNKRS, select retailers',
    description: 'The Bred 11 returns — one of the most anticipated retros every year.',
    isSoldOut: false,
  },
  {
    brand: 'Puma',
    name: 'Puma Speedcat OG "Black / Puma White"',
    sku: '398846-01',
    colorway: 'Black / Puma White',
    imageUrl: '',
    retailPrice: 110,
    releaseDate: '2026-06-06',
    releaseTime: '8:00 AM ET',
    where: 'puma.com, select retailers',
    description: 'The iconic racing shoe making a comeback in core colorways.',
    isSoldOut: false,
  },
];

async function seed() {
  console.log(`Seeding ${drops.length} drops to Firestore project ${PROJECT_ID}...`);
  let count = 0;
  for (const drop of drops) {
    await addDoc('drops', drop);
    count++;
    console.log(`  ✔ ${drop.releaseDate} — ${drop.brand} ${drop.name}`);
  }
  console.log(`\nDone! Seeded ${count} drops.`);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
