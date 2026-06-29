// Shared values matching frontend src/data/mock.ts

const ItemStatus = {
  AVAILABLE: 'available',
  RENTED: 'rented',
  CLEANING: 'cleaning',
  RESERVED: 'reserved'
};

const RentalStatus = {
  ACTIVE: 'active',
  UPCOMING: 'upcoming',
  RETURNED: 'returned',
  OVERDUE: 'overdue'
};

const CustomerTier = {
  STANDARD: 'Standard',
  GOLD: 'Gold',
  PLATINUM: 'Platinum'
};

module.exports = {
  ItemStatus,
  RentalStatus,
  CustomerTier
};
