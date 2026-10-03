const { Counter } = require('./counterModel');

/**
 * Allocate the next sequential bill number strictly monotonically increasing.
 * Once a bill number is used, it is NEVER reused even if deleted or cancelled.
 * It will always increment from the highest bill number: (max + 1).
 */
async function nextBillNo(session) {
  const Rental = require('../models/Rental');

  // Find the highest bill number currently in database
  const query = Rental.find({ billNo: { $exists: true, $ne: '' } }, 'billNo');
  if (session) query.session(session);
  const rentals = await query.lean();

  let maxExisting = 0;
  for (const r of rentals) {
    if (!r.billNo) continue;
    const match = String(r.billNo).match(/(\d+)/);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxExisting) {
        maxExisting = num;
      }
    }
  }

  // Atomically ensure Counter is at least maxExisting, then increment
  const counterQuery = Counter.findOneAndUpdate(
    { prefix: 'BILL' },
    { $max: { seq: maxExisting } },
    { upsert: true, new: true }
  );
  if (session) counterQuery.session(session);
  await counterQuery;

  const incQuery = Counter.findOneAndUpdate(
    { prefix: 'BILL' },
    { $inc: { seq: 1 } },
    { upsert: true, new: true }
  );
  if (session) incQuery.session(session);
  const updated = await incQuery;

  const nextSeq = Math.max(maxExisting + 1, updated ? updated.seq : maxExisting + 1);

  if (updated && updated.seq < nextSeq) {
    const fixQuery = Counter.findOneAndUpdate(
      { prefix: 'BILL' },
      { $set: { seq: nextSeq } }
    );
    if (session) fixQuery.session(session);
    await fixQuery;
  }

  const billNo = `BILL-${String(nextSeq).padStart(4, '0')}`;
  return billNo;
}

module.exports = { nextBillNo };
