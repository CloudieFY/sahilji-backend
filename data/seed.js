const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Item = require('../models/Item');
const Customer = require('../models/Customer');
const Rental = require('../models/Rental');

dotenv.config();

// This script DELETES ALL items, customers and rentals. That is almost never
// what you want against a live database, so it now refuses to run unless you
// explicitly opt in:
//
//   node data/seed.js --yes-delete-everything
//   CONFIRM_WIPE=1 npm run seed
const confirmed =
  process.argv.includes('--yes-delete-everything') || process.env.CONFIRM_WIPE === '1';

async function seedData() {
  if (!confirmed) {
    console.error(
      '\n⛔  Refusing to wipe the database.\n' +
        '    This will permanently delete ALL items, customers and rentals.\n' +
        '    Re-run with:  node data/seed.js --yes-delete-everything\n'
    );
    process.exit(1);
  }

  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('🗑️  Clearing existing data...');
    await Promise.all([
      Item.deleteMany({}),
      Customer.deleteMany({}),
      Rental.deleteMany({}),
    ]);

    console.log('✅ Database cleared! No dummy data seeded.');
    process.exit(0);
  } catch (err) {
    console.error('Seed error:', err);
    process.exit(1);
  }
}

seedData();
