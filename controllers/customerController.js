const Customer = require('../models/Customer');
const Rental = require('../models/Rental');
const { CustomerTier, RentalStatus } = require('../types');

// Only these fields may be set by the client. Everything else (customId,
// totalSpent, rentals, joined, timestamps) is managed by the server.
const WRITABLE = ['name', 'email', 'phone', 'secondaryPhone', 'tier'];

function pickCustomerFields(body = {}) {
  const out = {};
  for (const key of WRITABLE) {
    if (body[key] === undefined || body[key] === null) continue;
    out[key] = typeof body[key] === 'string' ? body[key].trim() : body[key];
  }
  // Blank email / secondaryPhone must be stored as "absent", never "" or null,
  // otherwise the unique email index collides across customers.
  if (!out.email) delete out.email;
  else out.email = String(out.email).toLowerCase();
  if (!out.secondaryPhone) delete out.secondaryPhone;
  if (out.tier && !Object.values(CustomerTier).includes(out.tier)) delete out.tier;
  return out;
}

// GET /api/customers
exports.getCustomers = async (req, res) => {
  try {
    const customers = await Customer.find().sort({ createdAt: -1 });
    res.json(customers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /api/customers/:id
exports.getCustomer = async (req, res) => {
  try {
    const customer = await Customer.findOne({ customId: req.params.id });
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    res.json(customer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POST /api/customers
exports.createCustomer = async (req, res) => {
  try {
    const data = pickCustomerFields(req.body);
    if (!data.name) return res.status(400).json({ error: 'Name is required' });
    if (!data.phone) return res.status(400).json({ error: 'Customer number is required' });

    if (data.email) {
      const existing = await Customer.findOne({ email: data.email });
      if (existing) {
        return res.status(409).json({ error: 'A customer with this email already exists' });
      }
    }

    const customer = new Customer(data);
    await customer.save();
    res.status(201).json(customer);
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(409).json({ error: 'A customer with this email already exists' });
    }
    res.status(400).json({ error: err.message });
  }
};

// PATCH /api/customers/:id
exports.updateCustomer = async (req, res) => {
  try {
    const data = pickCustomerFields(req.body);
    // Allow explicitly clearing the optional email.
    const unset = {};
    if (req.body && (req.body.email === '' || req.body.email === null)) unset.email = '';
    if (req.body && (req.body.secondaryPhone === '' || req.body.secondaryPhone === null)) {
      unset.secondaryPhone = '';
    }

    const update = { $set: data };
    if (Object.keys(unset).length) update.$unset = unset;

    if (data.email) {
      const existing = await Customer.findOne({
        email: data.email,
        customId: { $ne: req.params.id },
      });
      if (existing) {
        return res.status(409).json({ error: 'A customer with this email already exists' });
      }
    }

    const customer = await Customer.findOneAndUpdate(
      { customId: req.params.id },
      update,
      { new: true, runValidators: true }
    );
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    res.json(customer);
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(409).json({ error: 'A customer with this email already exists' });
    }
    res.status(400).json({ error: err.message });
  }
};

// DELETE /api/customers/:id
exports.deleteCustomer = async (req, res) => {
  try {
    const customer = await Customer.findOne({ customId: req.params.id });
    if (!customer) return res.status(404).json({ error: 'Customer not found' });

    // Block deletion while the client still has open rentals, otherwise those
    // rentals are orphaned (customer ref points at a deleted document).
    const openStatuses = [RentalStatus.ACTIVE, RentalStatus.UPCOMING, RentalStatus.OVERDUE];
    const openCount = await Rental.countDocuments({
      customer: customer._id,
      status: { $in: openStatuses },
    });
    if (openCount > 0) {
      return res.status(409).json({
        error: `Cannot delete this client — ${openCount} open rental(s) still linked. Close or delete those rentals first.`,
      });
    }

    await Customer.deleteOne({ _id: customer._id });
    res.json({ message: 'Customer deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
