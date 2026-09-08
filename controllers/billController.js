const { nextBillNo } = require('../utils/billNo');

// GET /api/bills/next
// Returns the next sequential bill number, matching the scheme used when a
// rental is created without an explicit bill number (BILL-0001, ...).
exports.getNextBillNo = async (req, res) => {
  try {
    const billNo = await nextBillNo();
    res.json({ billNo });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
