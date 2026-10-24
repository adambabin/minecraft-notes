// One-time upgrade for worlds created before per-world membership existed:
// everyone who added a place or item to the world becomes a member of it.
// Safe to run more than once; worlds that already have members are skipped.
//
// Usage: FIREBASE_SERVICE_ACCOUNT='<service account JSON>' node scripts/migrate-members.mjs
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const credentials = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!credentials) {
  console.error('FIREBASE_SERVICE_ACCOUNT is not set');
  process.exit(1);
}
initializeApp({ credential: cert(JSON.parse(credentials)) });
const db = getFirestore();

const worlds = await db.collection('worlds').get();
for (const world of worlds.docs) {
  if (Array.isArray(world.get('members'))) {
    console.log(`${world.id}: already has members, skipped`);
    continue;
  }
  const memberInfo = {};
  for (const kind of ['places', 'items']) {
    for (const entry of (await world.ref.collection(kind).get()).docs) {
      const by = entry.get('createdBy');
      if (by?.uid && !memberInfo[by.uid]) memberInfo[by.uid] = { name: by.name ?? 'Someone', joinedAt: entry.get('createdAt') ?? Date.now() };
    }
  }
  const members = Object.keys(memberInfo);
  await world.ref.update({ members, memberInfo });
  // Only counts are printed: workflow logs on a public repo are public.
  console.log(`${world.id}: added ${members.length} member(s)`);
}
