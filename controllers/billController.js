const { getNextSequence } = require('../utils/counterModel');

// GET /api/bills/next
// Returns a sequential invoice/bill number like INV-001
exports.getNextBillNo = async (req, res) => {
  try {
    const seq = await getNextSequence('INV');
    const billNo = `INV-${seq.toString().padStart(4, '0')}`;
    res.json({ billNo });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

