const bcrypt = require('bcryptjs');
const User = require('../models/User');

function normalizePhone(input) {
  return String(input || '').trim();
}

// POST /api/auth/signup
exports.signup = async (req, res) => {
  try {
    const { name, phone, password, role, status, email } = req.body || {};

    if (!name || !phone || !password) {
      return res.status(400).json({ error: 'name, phone, and password are required' });
    }

    const normalizedPhone = normalizePhone(phone);

    // Prevent duplicate users
    const existingByPhone = await User.findOne({ phone: normalizedPhone });
    if (existingByPhone) {
      return res.status(409).json({ error: 'An account with this phone already exists' });
    }

    if (email) {
      const normalizedEmail = String(email).trim().toLowerCase();
      const existingByEmail = await User.findOne({ email: normalizedEmail });
      if (existingByEmail) {
        return res.status(409).json({ error: 'An account with this email already exists' });
      }
    }

    const passwordHash = await bcrypt.hash(String(password), 10);

    const user = new User({
      name: String(name).trim(),
      phone: normalizedPhone,
      email: email ? String(email).trim().toLowerCase() : undefined,
      passwordHash,
      role: ['admin', 'reception'].includes(role) ? role : 'employee',
      status: status === 'active' ? 'active' : 'pending',
    });

    await user.save();

    res.status(201).json({
      id: user._id,
      name: user.name,
      role: user.role,
      status: user.status,
      phone: user.phone,
      email: user.email,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// POST /api/auth/login
exports.login = async (req, res) => {
  try {
    const { email, phone, password } = req.body || {};

    if ((!email && !phone) || !password) {
      return res.status(400).json({ error: 'email or phone and password are required' });
    }

    // Prefer phone if provided (frontend currently uses email, but signup uses phone)
    const query = email
      ? { email: String(email).trim().toLowerCase() }
      : { phone: normalizePhone(phone) };

    const user = await User.findOne(query);

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials or account not found.' });
    }

    if (user.status === 'pending') {
      return res.status(403).json({ error: 'Your account is pending admin approval.' });
    }

    const ok = await bcrypt.compare(String(password), user.passwordHash);
    if (!ok) {
      return res.status(401).json({ error: 'Invalid credentials or account not found.' });
    }

    res.json({
      id: user._id,
      name: user.name,
      role: user.role,
      status: user.status,
      phone: user.phone,
      email: user.email,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// GET /api/users
exports.getUsers = async (req, res) => {
  try {
    // Fetch all users, excluding their password hashes for security
    const users = await User.find({}, { passwordHash: 0 });
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// PUT /api/users/:identifier/status
exports.updateUserStatus = async (req, res) => {
  try {
    const { identifier } = req.params;
    const { status } = req.body;

    // Allow lookup by MongoDB _id, phone, or email
    const query = identifier.match(/^[0-9a-fA-F]{24}$/) 
      ? { _id: identifier } 
      : { $or: [{ phone: normalizePhone(identifier) }, { email: String(identifier).trim().toLowerCase() }] };

    const user = await User.findOneAndUpdate(query, { status }, { new: true });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ message: 'Status updated successfully', user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// DELETE /api/users/:identifier
exports.deleteUser = async (req, res) => {
  try {
    const { identifier } = req.params;

    // Allow lookup by MongoDB _id, phone, or email
    const query = identifier.match(/^[0-9a-fA-F]{24}$/) 
      ? { _id: identifier } 
      : { $or: [{ phone: normalizePhone(identifier) }, { email: String(identifier).trim().toLowerCase() }] };

    const user = await User.findOneAndDelete(query);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ message: 'User deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
