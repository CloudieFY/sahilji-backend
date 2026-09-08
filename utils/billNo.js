const { getNextSequence } = require('./counterModel');

/**
 * Allocate the next bill number atomically via the shared Counter collection.
 *
 * The previous approach regex-scanned rentals and sorted by string, which:
 *   - breaks after BILL-9999 (lexical sort: "BILL-9999" > "BILL-10000")
 *   - races under concurrent requests (two bills get the same number)
 *
 * A monotonic counter fixes both. We still verify against existing rentals so
 * numbers created by the old scheme can't be reused.
 */
async function nextBillNo(session) {
  const Rental = require('../models/Rental');
  for (let i = 0; i < 50; i += 1) {
    const seq = await getNextSequence('BILL');
    const billNo = `BILL-${String(seq).padStart(4, '0')}`;
    const q = Rental.findOne({ billNo });
    if (session) q.session(session);
    // eslint-disable-next-line no-await-in-loop
    const clash = await q;
    if (!clash) return billNo;
  }
  throw new Error('Could not allocate a unique bill number');
}

module.exports = { nextBillNo };
