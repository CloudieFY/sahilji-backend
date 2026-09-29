const { Counter } = require('./counterModel');

/**
 * Allocate the next sequential bill number.
 *
 * Rules:
 * 1. Checks all currently active bill numbers in the database.
 * 2. If a bill was deleted (e.g. 1, 2, [3 deleted], 4), it reuses that lowest
 *    available deleted number (e.g. 3) so numbers are not skipped.
 * 3. When no bills are deleted or gaps exist, it always increases monotonically: 1, 2, 3, 4, 5, 6...
 * 4. Syncs the Counter collection for consistency.
 */
async function nextBillNo(session) {
  const Rental = require('../models/Rental');

  const query = Rental.find({ billNo: { $exists: true, $ne: '' } }, 'billNo');
  if (session) query.session(session);
  const rentals = await query.lean();

  const existingNums = new Set();
  for (const r of rentals) {
    if (!r.billNo) continue;
    const match = String(r.billNo).match(/(\d+)/);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > 0) {
        existingNums.add(num);
      }
    }
  }

  // Find the lowest positive integer starting at 1 that is not currently present
  let nextSeq = 1;
  while (existingNums.has(nextSeq)) {
    nextSeq += 1;
  }

  const billNo = `BILL-${String(nextSeq).padStart(4, '0')}`;

  try {
    const highest = Math.max(0, ...existingNums, nextSeq);
    await Counter.findOneAndUpdate(
      { prefix: 'BILL' },
      { $set: { seq: highest } },
      { upsert: true }
    );
  } catch (err) {
    // Non-fatal
  }

  return billNo;
}

module.exports = { nextBillNo };
