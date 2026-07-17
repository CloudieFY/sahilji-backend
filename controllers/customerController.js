const Customer = require('../models/Customer');

// GET /api/customers
exports.getCustomers = async (req, res) => {
  try {
    const customers = await Customer.find().sort({ createdAt: -1 }).lean();
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
    // Frontend sends name,phone,tier and optionally email - model auto-adds totalSpent=0, rentals=0, joined=now, customId
    const customer = new Customer(req.body);
    await customer.save();
    res.status(201).json(customer);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// PATCH /api/customers/:id
exports.updateCustomer = async (req, res) => {
  try {
    const customer = await Customer.findOneAndUpdate(
      { customId: req.params.id },
      req.body,
      { new: true }
    );
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    res.json(customer);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// DELETE /api/customers/:id
exports.deleteCustomer = async (req, res) => {
  try {
    const customer = await Customer.findOneAndDelete({ customId: req.params.id });
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    res.json({ message: 'Customer deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
