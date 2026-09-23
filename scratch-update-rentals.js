const mongoose = require('mongoose');
require('./models/Rental');

mongoose.connect('mongodb://localhost:27017/cozy-rentals').then(async () => {
  const Rental = mongoose.model('Rental');
  const today = new Date().toISOString();
  
  // Find the first 3 rentals and update them to today's date so Today's/Monthly stats show data
  const rentals = await Rental.find().limit(3);
  for (const r of rentals) {
    r.startDate = today;
    r.deliveryDate = today;
    if (!r.advance) r.advance = 2500;
    if (!r.total) r.total = 5000;
    await r.save();
  }
  console.log(`Updated ${rentals.length} rentals to today's date: ${today}`);
  mongoose.disconnect();
}).catch(err => {
  console.error(err);
  process.exit(1);
});
