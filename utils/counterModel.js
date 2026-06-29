const mongoose = require('mongoose');

const counterSchema = new mongoose.Schema({
  prefix: { type: String, required: true, unique: true },
  seq: { type: Number, default: 0 }
});

const Counter = mongoose.model('Counter', counterSchema);

async function getNextSequence(prefix) {
  const counter = await Counter.findOneAndUpdate(
    { prefix },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return counter.seq;
}

function generateId(prefix, seq) {
  return `${prefix}-${seq.toString().padStart(3, '0')}`;
}

module.exports = { getNextSequence, generateId };
