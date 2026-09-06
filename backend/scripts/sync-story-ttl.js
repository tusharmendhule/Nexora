/**
 * Sync Story TTL Index — moments expire, clips persist
 * ======================================================
 * The Story model previously applied a blanket TTL (`expireAfterSeconds:
 * 86400` on `createdAt`) to EVERY story document. Moments should expire
 * after 24h (Instagram-style) but clips must NOT — they share the Story
 * collection, so the blanket index was silently deleting clips too.
 *
 * This script drops the old blanket index and creates a partial TTL index
 * that only expires documents where `storyType === 'moment'`.
 *
 * Run from backend/:
 *   node scripts/sync-story-ttl.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const mongoose = require('mongoose');

async function main() {
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI missing. Check backend/.env');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 45000 });
  const db = mongoose.connection.db;
  const collection = db.collection('stories');

  const before = await collection.indexes();
  console.log('Indexes before:', JSON.stringify(before, null, 2));

  // Drop any blanket createdAt TTL index (one without the partial filter).
  for (const idx of before) {
    const isCreatedAtTtl =
      idx.key &&
      Object.keys(idx.key).length === 1 &&
      idx.key.createdAt === 1 &&
      typeof idx.expireAfterSeconds === 'number';

    if (isCreatedAtTtl) {
      // Keep it only if it already targets moments exclusively.
      const partial = idx.partialFilterExpression;
      if (partial && partial.storyType === 'moment') {
        console.log(`Index ${idx.name} already moments-only — skipping.`);
        continue;
      }
      console.log(`Dropping blanket TTL index: ${idx.name}`);
      await collection.dropIndex(idx.name);
    }
  }

  // Create the partial TTL index: moments expire after 24h, clips persist.
  await collection.createIndex(
    { createdAt: 1 },
    {
      name: 'createdAt_1_moments_only',
      expireAfterSeconds: 86400,
      partialFilterExpression: { storyType: 'moment' },
    }
  );
  console.log('Created partial TTL index: createdAt_1_moments_only (moments expire, clips persist).');

  const after = await collection.indexes();
  console.log('Indexes after:', JSON.stringify(after, null, 2));

  await mongoose.disconnect();
  console.log('\nDone. Clips (storyType:"clip") now persist; moments still auto-expire after 24h.');
}

main().catch((err) => {
  console.error('Sync failed:', err);
  process.exit(1);
});
