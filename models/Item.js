const mongoose = require('mongoose');
const { getNextSequence, generateId } = require('../utils/counterModel');
const { ItemStatus } = require('../types');

const itemSchema = new mongoose.Schema({
  customId: { type: String, required: true, unique: true },
  name: { type: String, required: true, maxlength: 80 },
  designer: { type: String, required: true, maxlength: 60 },
  category: { type: String, required: true, maxlength: 20 },
  subcategory: { type: String, default: '', maxlength: 40 },
  size: { type: String, required: true, maxlength: 8 },
  color: { type: String, required: true, maxlength: 30 },
  pricePerDay: { type: Number, required: true, min: 0 },
  retailValue: { type: Number, required: true, min: 0 },
  quantity: { type: Number, default: 1, min: 0 },
  status: { 
    type: String, 
    enum: Object.values(ItemStatus),
    default: ItemStatus.AVAILABLE 
  },
  image: { type: String, default: '' },
  timesRented: { type: Number, default: 0 }
}, {
  timestamps: true
});

itemSchema.pre('validate', async function(next) {
  if (!this.customId) {
    const seq = await getNextSequence('VV');
    this.customId = generateId('VV', seq);
  }
  next();
});

module.exports = mongoose.model('Item', itemSchema);
