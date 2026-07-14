const Rental = require('../models/Rental');
const Item = require('../models/Item');
const Customer = require('../models/Customer');
const { RentalStatus, ItemStatus } = require('../types');

// GET /api/rentals
exports.getRentals = async (req, res) => {
  try {
    const rentals = await Rental.find().populate('item customer').sort({ createdAt: -1 });
    res.json(rentals);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /api/rentals/:id
exports.getRental = async (req, res) => {
  try {
    const rental = await Rental.findOne({ customId: req.params.id }).populate('item customer');
    if (!rental) return res.status(404).json({ error: 'Rental not found' });
    res.json(rental);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POST /api/rentals - complex: compute total, update item/customer
exports.createRental = async (req, res) => {
  let session;
  // Use a database transaction to ensure all rentals are created or none are.
  try {
    session = await Rental.startSession();
    session.startTransaction();
    const {
      customerId,
      billNo: clientBillNo, // Use a different name to avoid confusion
      address,
      advance = 0,
      discount: billDiscount = 0, // Bill-level discount
      securityAmount = 0,
      signature = '',
      pieces = [], // Expect an array of pieces for the bill
    } = req.body;

    // --- Pre-transaction Validation ---
    if (!pieces || pieces.length === 0) {
      return res.status(400).json({ error: 'At least one piece is required for a rental bill.' });
    }

    // --- Customer Validation ---
    const customer = await Customer.findOne({ customId: customerId }).session(session);
    if (!customer) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ error: 'Customer not found' });
    }

    // --- Bill Number Generation (moved to backend for performance) ---
    let billNo = clientBillNo;
    if (!billNo) {
      const lastRentalWithBillNo = await Rental.findOne({ billNo: { $regex: /^BILL-/ } })
        .sort({ billNo: -1 })
        .session(session);

      let nextSeq = 1;
      if (lastRentalWithBillNo && lastRentalWithBillNo.billNo) {
        const match = lastRentalWithBillNo.billNo.match(/BILL-(\d+)/);
        if (match) {
          nextSeq = parseInt(match[1], 10) + 1;
        }
      }
      billNo = `BILL-${String(nextSeq).padStart(4, "0")}`;
    }


    const createdRentals = [];
    let subTotalForAllPieces = 0;
    for (const piece of pieces) {
      subTotalForAllPieces += (Number(piece.rate) || 0) * (Number(piece.quantity) || 1);
    }

    let totalBillAmountAfterDiscount = 0;

    // --- Loop through each piece in the bill ---
    for (const [index, piece] of pieces.entries()) {
      const {
        itemId,
        itemNo,
        deliveryDate,
        deliveryTimePeriod, // Piece-level discount
        penalty = 0, // Piece-level penalty
        endDate,
        endTimePeriod,
        rate = 0,
        quantity = 1,
        remark = '',
        status,
      } = piece;

      // --- Item Validation ---
      const item = await Item.findOne({ customId: itemId }).session(session);
      if (!item) {
        throw new Error(`Item with ID ${itemId} not found.`);
      }

      // --- Status Normalization ---
      let normalizedStatus = typeof status === 'string' ? status.toLowerCase() : RentalStatus.UPCOMING;
      if (!Object.values(RentalStatus).includes(normalizedStatus)) {
        normalizedStatus = RentalStatus.UPCOMING;
      }

      // Calculate total for this specific piece, including its discount, penalty, and shared advance/security
      const pieceSubTotal = (Number(rate) || 0) * (Number(quantity) || 1);
      // Assign the entire bill discount to the first item only.
      const pieceDiscount = index === 0 ? billDiscount : 0;
      const pieceAdvance = index === 0 ? (Number(advance) || 0) : 0;
      const pieceSecurityAmount = index === 0 ? (Number(securityAmount) || 0) : 0;
      let pieceFinalTotal = pieceSubTotal - pieceDiscount + (Number(penalty) || 0) + pieceSecurityAmount;
      totalBillAmountAfterDiscount += pieceFinalTotal;

      const rental = new Rental({
        // Bill-level details
        customer: customer._id,
        billNo,
        address,
        advance: pieceAdvance,
        securityAmount: pieceSecurityAmount,
        signature,
        // Piece-specific details
        item: item._id,
        itemNo: itemNo || item.customId,
        deliveryDate: deliveryDate ? new Date(deliveryDate) : new Date(),
        deliveryTimePeriod: deliveryTimePeriod || '',
        discount: pieceDiscount, // Store piece-level discount
        penalty: Number(penalty) || 0, // Store piece-level penalty
        endDate: new Date(endDate),
        endTimePeriod: endTimePeriod || '',
        rate: Number(rate) || 0,
        quantity: Math.max(1, Number(quantity) || 1),
        remark,
        status: normalizedStatus,
        total: pieceFinalTotal, // Store the final total after discount/penalty
        // Default values for other fields
        lostQuantity: 0,
        securityReturned: false,
        securityReturnedAt: null,
        startDate: new Date(deliveryDate), // Assuming startDate is same as deliveryDate
      });

      await rental.save({ session });
      createdRentals.push(rental);

      // --- Update Item ---
      item.timesRented += 1;
      if (normalizedStatus === RentalStatus.ACTIVE) item.status = ItemStatus.RENTED;
      else if (normalizedStatus === RentalStatus.UPCOMING) item.status = ItemStatus.RESERVED;
      await item.save({ session });
    }

    // --- Update Customer ---
    customer.rentals += pieces.length;
    customer.totalSpent += totalBillAmountAfterDiscount; // totalBillAmount now includes security amount for the first item
    await customer.save({ session });

    await session.commitTransaction();
    session.endSession();

    // Populate and return the first created rental as a representative for the bill
    const populatedRental = await Rental.findById(createdRentals[0]._id).populate('item customer');
    res.status(201).json(populatedRental);
  } catch (err) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    if (session) session.endSession();
    res.status(400).json({ error: err.message });
  }
};

// PATCH /api/rentals/:id
exports.updateRental = async (req, res) => {
  try {
    const userRole = String(req.get('x-user-role') || req.headers['x-user-role'] || '')
      .trim()
      .toLowerCase();
    const updates = { ...req.body };
    const updateKeys = Object.keys(updates);

    if (typeof updates.remarkConfirmedBy === 'string') {
      updates.remarkConfirmedBy = updates.remarkConfirmedBy.trim();
    }
    if (typeof updates.drycleanCompletedBy === 'string') {
      updates.drycleanCompletedBy = updates.drycleanCompletedBy.trim();
    }
    if (typeof updates.drycleanAdminConfirmedBy === 'string') {
      updates.drycleanAdminConfirmedBy = updates.drycleanAdminConfirmedBy.trim();
    }
    if (typeof updates.adminReconfirmedBy === 'string') {
      updates.adminReconfirmedBy = updates.adminReconfirmedBy.trim();
    }
    if (updates.remarkCompleted != null) {
      updates.remarkCompleted = Boolean(updates.remarkCompleted);
    }
    if (updates.drycleanCompleted != null) {
      updates.drycleanCompleted = Boolean(updates.drycleanCompleted);
    }
    if (updates.adminReconfirmed != null) {
      updates.adminReconfirmed = Boolean(updates.adminReconfirmed);
    }
    if (updates.adminReconfirmedAt) {
      updates.adminReconfirmedAt = new Date(updates.adminReconfirmedAt);
    }
    if (updates.drycleanAdminConfirmed != null) {
      updates.drycleanAdminConfirmed = Boolean(updates.drycleanAdminConfirmed);
    }
    if (updates.drycleanAdminConfirmedAt) {
      updates.drycleanAdminConfirmedAt = new Date(updates.drycleanAdminConfirmedAt);
    }
    if (updates.securityReturned != null) {
      updates.securityReturned = Boolean(updates.securityReturned);
    }
    if (updates.securityReturnedAt) {
      updates.securityReturnedAt = new Date(updates.securityReturnedAt);
    }
    if (updates.returnedAt) {
      updates.returnedAt = new Date(updates.returnedAt);
    }

    console.info('[rentals] update request', {
      id: req.params.id,
      userRole: userRole || '(missing)',
      updateKeys,
    });

    const allowedEmployeeUpdates = ['remarkCompleted', 'remarkConfirmedBy', 'drycleanCompleted', 'drycleanCompletedBy'];
    const allowedEmployeeDeliveryUpdates = ['status', 'advance', 'securityReturned', 'securityReturnedAt', 'returnedAt'];
    const isReadyUpdate = updateKeys.length > 0 && updateKeys.every(update => allowedEmployeeUpdates.includes(update));
    const isDeliveryUpdate = updateKeys.length > 0 && updateKeys.every(update =>
      [...allowedEmployeeUpdates, ...allowedEmployeeDeliveryUpdates].includes(update)
    );

    if (userRole === 'employee') {
      if (!isReadyUpdate && !isDeliveryUpdate) {
        return res.status(403).json({ error: 'Employees can only update rental readiness, dryclean completion, or delivery/return status.' });
      }
      if (updates.remarkCompleted === true && !updates.remarkConfirmedBy) {
        return res.status(400).json({ error: 'Employee name is required to mark a rental as ready.' });
      }
      if (updates.drycleanCompleted === true && !updates.drycleanCompletedBy) {
        return res.status(400).json({ error: 'Employee name is required to mark dryclean as completed.' });
      }
    } else if (userRole !== 'admin') {
      return res.status(403).json({ error: 'Admin only' });
    }

    if (updates.adminReconfirmed === true && !updates.adminReconfirmedBy) {
      return res.status(400).json({ error: 'Admin name is required to reconfirm a rental.' });
    }
    if (updates.drycleanAdminConfirmed === true && !updates.drycleanAdminConfirmedBy) {
      return res.status(400).json({ error: 'Admin name is required to confirm dryclean.' });
    }

    if (updates && typeof updates.status === 'string') {
      updates.status = updates.status.toLowerCase();
      if (!Object.values(RentalStatus).includes(updates.status)) {
        delete updates.status;
      }
    }
    if (updates.quantity != null) {
      updates.quantity = Math.max(0, Number(updates.quantity) || 1);
    }
    if (updates.lostQuantity != null) {
      updates.lostQuantity = Math.max(0, Number(updates.lostQuantity) || 0);
    }
    const rental = await Rental.findOne({ customId: req.params.id }).populate('item customer');
    if (!rental) return res.status(404).json({ error: 'Rental not found' });

    const oldStatus = rental.status;
    const oldPenalty = rental.penalty || 0;
    Object.assign(rental, updates);

    // If an employee marked dryclean completed, set item status to CLEANING
    if (updates.drycleanCompleted === true && rental.item) {
      try {
        rental.item.status = ItemStatus.CLEANING;
        await rental.item.save();
      } catch (err) {
        console.error('[rentals] failed to set item status to CLEANING', err);
      }
    }

    // If admin confirmed dryclean, mark item available
    if (updates.drycleanAdminConfirmed === true && rental.item) {
      try {
        rental.item.status = ItemStatus.AVAILABLE;
        await rental.item.save();
      } catch (err) {
        console.error('[rentals] failed to set item status to AVAILABLE after dryclean confirm', err);
      }
    }

    if (updates.penalty != null && rental.customer) {
      const penaltyDelta = Number(updates.penalty) - Number(oldPenalty);
      if (!Number.isNaN(penaltyDelta) && penaltyDelta !== 0) {
        rental.customer.totalSpent += penaltyDelta;
        await rental.customer.save();
      }
    }

    if (updates.status && updates.status !== oldStatus && rental.item) {
      if ([RentalStatus.ACTIVE, RentalStatus.OVERDUE].includes(updates.status)) {
        rental.item.status = ItemStatus.RENTED;
      } else if (updates.status === RentalStatus.UPCOMING) {
        rental.item.status = ItemStatus.RESERVED;
      } else if (updates.status === RentalStatus.RETURNED) {
        const otherOpenRental = await Rental.findOne({
          _id: { $ne: rental._id },
          item: rental.item._id,
          status: { $in: [RentalStatus.ACTIVE, RentalStatus.OVERDUE, RentalStatus.UPCOMING] },
        }).sort({ createdAt: -1 });

        if (otherOpenRental?.status === RentalStatus.ACTIVE || otherOpenRental?.status === RentalStatus.OVERDUE) {
          rental.item.status = ItemStatus.RENTED;
        } else if (otherOpenRental?.status === RentalStatus.UPCOMING) {
          rental.item.status = ItemStatus.RESERVED;
        } else {
          rental.item.status = ItemStatus.AVAILABLE;
        }
      }

      await rental.item.save();
    }

    await rental.save();
    const populatedRental = await Rental.findById(rental._id).populate('item customer');
    res.json(populatedRental);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// DELETE /api/rentals/:id
exports.deleteRental = async (req, res) => {
  const { billNo } = req.query;
  const { id } = req.params;

  try {
    let rentalsToDelete;
    if (billNo) {
      rentalsToDelete = await Rental.find({ billNo }).populate('item customer');
    } else {
      const singleRental = await Rental.findOne({ customId: id }).populate('item customer');
      rentalsToDelete = singleRental ? [singleRental] : [];
    }

    if (rentalsToDelete.length === 0) {
      return res.status(404).json({ error: 'Rental(s) not found' });
    }

    for (const rental of rentalsToDelete) {
      // Rollback counters and restore item availability when no open rentals remain.
      if (rental.item) {
        rental.item.timesRented = Math.max(0, rental.item.timesRented - 1);
        const remainingOpenRental = await Rental.findOne({
          _id: { $ne: rental._id },
          item: rental.item._id,
          status: { $in: [RentalStatus.ACTIVE, RentalStatus.UPCOMING] }
        });

        if (!remainingOpenRental) {
          rental.item.status = ItemStatus.AVAILABLE;
        } else if (remainingOpenRental.status === RentalStatus.ACTIVE) {
          rental.item.status = ItemStatus.RENTED;
        } else {
          rental.item.status = ItemStatus.RESERVED;
        }
        await rental.item.save();
      }
      if (rental.customer) {
        rental.customer.rentals = Math.max(0, rental.customer.rentals - 1);
        rental.customer.totalSpent = Math.max(0, rental.customer.totalSpent - rental.total);
        await rental.customer.save();
      }
    }

    const idsToDelete = rentalsToDelete.map(r => r._id);
    await Rental.deleteMany({ _id: { $in: idsToDelete } });

    res.json({ message: 'Rental bill deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
