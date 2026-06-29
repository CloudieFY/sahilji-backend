const mongoose = require('mongoose');
const { getNextSequence, generateId } = require('../utils/counterModel');
const { CustomerTier } = require('../types');

const customerSchema = new mongoose.Schema({
  customId: { type: String, required: true, unique: true },
  name: { type: String, required: true, maxlength: 100 },
  email: { type: String, maxlength: 255, unique: true, sparse: true },
  phone: { type: String, required: true, maxlength: 40 },
  secondaryPhone: { type: String, maxlength: 40 },
  tier: { 
    type: String, 
    enum: Object.values(CustomerTier),
    default: CustomerTier.STANDARD 
  },
  totalSpent: { type: Number, default: 0 },
  rentals: { type: Number, default: 0 },
  joined: { type: Date, default: Date.now }
}, {
  timestamps: true
});

customerSchema.pre('validate', async function(next) {
  if (!this.customId) {
    const seq = await getNextSequence('C');
    this.customId = generateId('C', seq);
  }
  next();
});

module.exports = mongoose.model('Customer', customerSchema);
