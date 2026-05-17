#!/usr/bin/env node
/**
 * Clears all Firestore `users` docs except kendall.ryan.lewis@gmail.com
 * and seeds 11 dummy users.
 *
 * Uses the OAuth access token stored by `firebase login` — no service account needed.
 * If the token is expired, run `firebase login --reauth` then retry.
 *
 * Usage:
 *   node scripts/seed-users.mjs
 */

import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const PROJECT_ID = 'sneaker-app-fca1c';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

// ── Auth token ────────────────────────────────────────────────────────────────
function getAccessToken() {
    const configPath = join(homedir(), '.config', 'configstore', 'firebase-tools.json');
    try {
        const config = JSON.parse(readFileSync(configPath, 'utf8'));
        const token = config?.tokens?.access_token;
        const expiresAt = config?.tokens?.expires_at ?? 0;
        if (!token) throw new Error('No access_token in firebase-tools config');
        if (Date.now() > expiresAt) {
            console.warn('⚠  Firebase access token may be expired. Run: firebase login --reauth');
        }
        return token;
    } catch (e) {
        throw new Error(`Could not read Firebase CLI token: ${e.message}`);
    }
}

// ── Firestore REST helpers ────────────────────────────────────────────────────
async function firestoreGet(path, token) {
    const res = await fetch(`${BASE}/${path}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`GET ${path} → ${res.status} ${await res.text()}`);
    return res.json();
}

async function firestoreDelete(path, token) {
    const res = await fetch(`${BASE}/${path}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok && res.status !== 404) throw new Error(`DELETE ${path} → ${res.status} ${await res.text()}`);
}

async function firestoreSet(path, fields, token) {
    const res = await fetch(`${BASE}/${path}`, {
        method: 'PATCH',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fields }),
    });
    if (!res.ok) throw new Error(`PATCH ${path} → ${res.status} ${await res.text()}`);
    return res.json();
}

// ── Firestore value helpers ───────────────────────────────────────────────────
const str = v => ({ stringValue: v });
const num = v => ({ integerValue: String(v) });

// ── Config ────────────────────────────────────────────────────────────────────
// UID of kendall.ryan.lewis@gmail.com — look this up from Firebase Auth console
// or leave as null to skip deletion by UID; we identify it by matching the doc.
// We keep ALL docs that have photoURL pointing to a real uploaded photo, OR
// we simply keep the doc whose uid matches KEEP_UID.
// Set KEEP_UID to your actual UID (found in Firebase Auth → Users tab).
const KEEP_UID = null; // set e.g. 'abc123uid' to protect by UID; null = protect none by UID

const DUMMY_USERS = [
    { uid: 'dummy_user_001', username: 'jordanflex', usernameLower: 'jordanflex', photoURL: 'https://i.pravatar.cc/150?img=1', bio: 'Jordan 1 collector 🏀', location: 'Chicago, IL', shoeSize: '10.5' },
    { uid: 'dummy_user_002', username: 'sneakrqueen', usernameLower: 'sneakrqueen', photoURL: 'https://i.pravatar.cc/150?img=5', bio: 'All about the fits ✨', location: 'Atlanta, GA', shoeSize: '8' },
    { uid: 'dummy_user_003', username: 'yeezyhead', usernameLower: 'yeezyhead', photoURL: 'https://i.pravatar.cc/150?img=8', bio: 'Yeezy stan since 750 drop 🌕', location: 'Los Angeles, CA', shoeSize: '11' },
    { uid: 'dummy_user_004', username: 'newbalancenerd', usernameLower: 'newbalancenerd', photoURL: 'https://i.pravatar.cc/150?img=12', bio: '550s only. NB or nothing.', location: 'Boston, MA', shoeSize: '9.5' },
    { uid: 'dummy_user_005', username: 'kicksbymikey', usernameLower: 'kicksbymikey', photoURL: 'https://i.pravatar.cc/150?img=15', bio: 'Buying/selling heat 🔥', location: 'New York, NY', shoeSize: '12' },
    { uid: 'dummy_user_006', username: 'reebokretro', usernameLower: 'reebokretro', photoURL: 'https://i.pravatar.cc/150?img=20', bio: 'Classic leather forever 👟', location: 'Detroit, MI', shoeSize: '10' },
    { uid: 'dummy_user_007', username: 'dunkguru', usernameLower: 'dunkguru', photoURL: 'https://i.pravatar.cc/150?img=25', bio: 'Low, Mid, High — I got all 3.', location: 'Portland, OR', shoeSize: '11.5' },
    { uid: 'dummy_user_008', username: 'airforce.anna', usernameLower: 'airforce.anna', photoURL: 'https://i.pravatar.cc/150?img=30', bio: 'AF1 world champion 🏆', location: 'Miami, FL', shoeSize: '7.5' },
    { uid: 'dummy_user_009', username: 'solebrotha', usernameLower: 'solebrotha', photoURL: 'https://i.pravatar.cc/150?img=33', bio: 'Sneaker culture is my culture.', location: 'Houston, TX', shoeSize: '13' },
    { uid: 'dummy_user_010', username: 'vaultvanessa', usernameLower: 'vaultvanessa', photoURL: 'https://i.pravatar.cc/150?img=44', bio: 'Curating closets since 2019 💜', location: 'Seattle, WA', shoeSize: '8.5' },
    { uid: 'dummy_user_011', username: 'adidaskid', usernameLower: 'adidaskid', photoURL: 'https://i.pravatar.cc/150?img=50', bio: 'Three stripes, no rivals 🖤', location: 'Denver, CO', shoeSize: '10' },
];

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
    const token = getAccessToken();

    // 1. List all existing user docs
    console.log('Fetching existing users...');
    let allDocs = [];
    let pageToken;
    do {
        const url = pageToken
            ? `${BASE}/users?pageToken=${encodeURIComponent(pageToken)}`
            : `${BASE}/users`;
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) throw new Error(`List users → ${res.status} ${await res.text()}`);
        const body = await res.json();
        if (body.documents) allDocs.push(...body.documents);
        pageToken = body.nextPageToken;
    } while (pageToken);

    console.log(`Found ${allDocs.length} user doc(s).`);

    // 2. Delete all except KEEP_UID
    let kept = 0;
    let deleted = 0;
    for (const doc of allDocs) {
        // doc.name is the full resource path, uid is the last segment
        const uid = doc.name.split('/').pop();
        if (uid === KEEP_UID) {
            console.log(`  ✓ Keeping ${uid} (protected UID)`);
            kept++;
            continue;
        }
        // Also keep if the doc has email matching our protected user
        // (in case KEEP_UID wasn't set but we can identify by email field)
        const email = doc.fields?.email?.stringValue ?? '';
        if (email === 'kendall.ryan.lewis@gmail.com') {
            console.log(`  ✓ Keeping ${uid} (matched protected email)`);
            kept++;
            continue;
        }
        // Skip existing dummy users to allow re-running
        if (uid.startsWith('dummy_user_')) {
            console.log(`  ~ Overwriting dummy ${uid}`);
        } else {
            console.log(`  ✗ Deleting ${uid}`);
            await firestoreDelete(`users/${uid}`, token);
            deleted++;
        }
    }

    console.log(`\nDeleted ${deleted} user(s). Kept ${kept} protected user(s).`);

    // 3. Seed 11 dummy users
    console.log('\nSeeding dummy users...');
    for (const u of DUMMY_USERS) {
        await firestoreSet(`users/${u.uid}`, {
            uid: str(u.uid),
            username: str(u.username),
            usernameLower: str(u.usernameLower),
            photoURL: str(u.photoURL),
            bio: str(u.bio),
            location: str(u.location),
            shoeSize: str(u.shoeSize),
            followerCount: num(0),
            followingCount: num(0),
        }, token);
        console.log(`  + ${u.username}`);
    }

    console.log('\n✅ Done. 11 dummy users seeded.');
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
