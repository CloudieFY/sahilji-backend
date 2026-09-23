/**
 * One-off migration: move base64 `data:` image blobs out of the items
 * collection and onto disk (uploads/items/), replacing each with its
 * "/uploads/items/<name>.jpg" path.
 *
 * Safe to run multiple times — items whose `image` is already a URL/path are
 * skipped. Nothing is deleted; only the `image` (and `images[]` if present)
 * fields are rewritten.
 *
 *   node scripts/migrate-images-to-disk.js
 */
const mongoose = require('mongoose');
require('dotenv').config();

const Item = require('../models/Item');
const { persistImage, persistImages } = require('../utils/imageStore');

(async () => {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI missing');
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
  console.log('connected');

  const cursor = Item.find({}).cursor();
  let scanned = 0;
  let migrated = 0;
  let skipped = 0;
  let failed = 0;

  for (let doc = await cursor.next(); doc != null; doc = await cursor.next()) {
    scanned += 1;
    const update = {};

    if (typeof doc.image === 'string' && doc.image.startsWith('data:')) {
      try {
        const before = doc.image.length;
        const url = await persistImage(doc.image);
        if (url && !url.startsWith('data:')) {
          update.image = url;
          console.log(`  ${doc.customId}: image ${(before / 1024).toFixed(0)}KB -> ${url}`);
        } else {
          failed += 1;
          console.warn(`  ${doc.customId}: image could not be persisted, left as-is`);
        }
      } catch (err) {
        failed += 1;
        console.error(`  ${doc.customId}: ${err.message}`);
      }
    }

    if (Array.isArray(doc.images) && doc.images.some((x) => typeof x === 'string' && x.startsWith('data:'))) {
      try {
        update.images = await persistImages(doc.images);
        console.log(`  ${doc.customId}: images[] -> ${update.images.join(', ')}`);
      } catch (err) {
        console.error(`  ${doc.customId}: images[] ${err.message}`);
      }
    }

    if (Object.keys(update).length) {
      await Item.updateOne({ _id: doc._id }, { $set: update });
      migrated += 1;
    } else {
      skipped += 1;
    }
  }

  console.log(`\nDone. scanned=${scanned} migrated=${migrated} skipped=${skipped} failed=${failed}`);
  await mongoose.disconnect();
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
