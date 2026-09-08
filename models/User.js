const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true, unique: true, index: true },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      index: {
        unique: true,
        partialFilterExpression: { email: { $type: 'string', $gt: '' } },
      },
    },

    passwordHash: { type: String, required: true },

    role: {
      type: String,
      enum: ['admin', 'employee', 'reception'],
      default: 'employee',
      index: true,
    },

    status: {
      type: String,
      enum: ['pending', 'active', 'disabled'],
      default: 'pending',
      index: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);

