/**
 * One-off migration: fix the unique email indexes so that a blank / missing
 * email no longer collides.
 *
 * Problem: `customers.email_1` was created as { unique: true } WITHOUT sparse,
 * so a second customer with no email (email = null) throws E11000.
 *
 * Fix:
 *   1. Normalise existing data: unset email when it is null / "" / whitespace.
 *   2. Drop the old email_1 index (customers + users).
 *   3. Recreate it as a PARTIAL unique index that only applies to real,
 *      non-empty string emails.
 *   4. Seed the BILL counter from the highest existing bill number so the new
 *      atomic bill-number generator starts past whatever the old scheme left.
 *
 * Safe to run multiple times.
 *
 *   node scripts/fix-indexes.js
 */
const mongoose = require('mongoose');
require('dotenv').config();

const PARTIAL = { unique: true, partialFilterExpression: { email: { $type: 'string', $gt: '' } } };

async function fixCollection(db, name) {
  const coll = db.collection(name);

  // 1. normalise blank emails -> unset
  const norm = await coll.updateMany(
    { $or: [{ email: null }, { email: '' }, { email: /^\s*$/ }] },
    { $unset: { email: '' } }
  );
  console.log(`[${name}] normalised ${norm.modifiedCount} blank email(s)`);

  // 2. drop existing email index (any shape)
  const indexes = await coll.indexes();
  const existing = indexes.find((i) => i.name === 'email_1' || (i.key && i.key.email === 1));
  if (existing) {
    await coll.dropIndex(existing.name);
    console.log(`[${name}] dropped index ${existing.name}`);
  } else {
    console.log(`[${name}] no email index to drop`);
  }

  // 3. recreate as partial unique
  await coll.createIndex({ email: 1 }, PARTIAL);
  console.log(`[${name}] created partial unique index on email`);
}

async function seedBillCounter(db) {
  const rentals = db.collection('rentals');
  const withBill = await rentals
    .find({ billNo: /^(BILL|INV|B)-\d+/i }, { projection: { billNo: 1 } })
    .toArray();

  let max = 0;
  for (const r of withBill) {
    const m = String(r.billNo).match(/(\d+)/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }

  const current = await db.collection('counters').findOne({ prefix: 'BILL' });
  const currentSeq = current ? current.seq : 0;
  if (max > currentSeq) {
    await db.collection('counters').updateOne(
      { prefix: 'BILL' },
      { $set: { seq: max } },
      { upsert: true }
    );
    console.log(`[counters] BILL seq set to ${max} (was ${currentSeq})`);
  } else {
    console.log(`[counters] BILL seq already >= ${max} (is ${currentSeq}), no change`);
  }
}

(async () => {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI missing');
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;

  for (const name of ['customers', 'users']) {
    try {
      await fixCollection(db, name);
    } catch (err) {
      console.error(`[${name}] ERROR:`, err.message);
    }
  }

  try {
    await seedBillCounter(db);
  } catch (err) {
    console.error('[counters] ERROR:', err.message);
  }

  await mongoose.disconnect();
  console.log('Done.');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
