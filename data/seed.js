const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Item = require('../models/Item');
const Customer = require('../models/Customer');
const Rental = require('../models/Rental');

dotenv.config();

async function seedData() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('🗑️  Clearing existing data...');
    await Promise.all([
      Item.deleteMany({}),
      Customer.deleteMany({}),
      Rental.deleteMany({})
    ]);

    console.log('✅ Database cleared! No dummy data seeded.');
    process.exit(0);
  } catch (err) {
    console.error('Seed error:', err);
    process.exit(1);
  }
}

seedData();
