// Nightly backup: copies every world, place, item and photo out of Firestore
// into plain files (JSON + JPEG) so there's a dated, readable copy in git.
//
// Usage: FIREBASE_SERVICE_ACCOUNT='<service account JSON>' node scripts/backup.mjs <out-dir>
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const out = process.argv[2] ?? 'backup-out';
const credentials = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!credentials) {
  console.error('FIREBASE_SERVICE_ACCOUNT is not set');
  process.exit(1);
}

initializeApp({ credential: cert(JSON.parse(credentials)) });
const db = getFirestore();

const json = (value) => JSON.stringify(value, null, 2) + '\n';
const byCreated = (a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0);

const worlds = await db.collection('worlds').get();
let total = 0;
for (const world of worlds.docs) {
  const dir = join(out, world.id);
  await rm(dir, { recursive: true, force: true });
  await mkdir(join(dir, 'images'), { recursive: true });
  await writeFile(join(dir, 'world.json'), json({ id: world.id, ...world.data() }));

  for (const kind of ['places', 'items']) {
    const snap = await world.ref.collection(kind).get();
    const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort(byCreated);
    await writeFile(join(dir, `${kind}.json`), json(rows));
    total += rows.length;
  }

  const images = await world.ref.collection('images').get();
  const meta = [];
  for (const d of images.docs) {
    const { dataUrl, ...rest } = d.data();
    const [, base64] = String(dataUrl).split(',');
    await writeFile(join(dir, 'images', `${d.id}.jpg`), Buffer.from(base64 ?? '', 'base64'));
    meta.push({ id: d.id, ...rest });
  }
  await writeFile(join(dir, 'images.json'), json(meta.sort(byCreated)));
  total += meta.length;
  console.log(`${world.id}: backed up`);
}
console.log(`Done: ${worlds.size} worlds, ${total} entries`);
