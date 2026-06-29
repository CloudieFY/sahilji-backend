const express = require('express');
const rentalController = require('../controllers/rentalController');

const router = express.Router();

const requireAdmin = require('../middlewares/requireAdmin');

router.get('/', rentalController.getRentals);

// Admin-only: create/update/delete rentals
router.post('/', requireAdmin, rentalController.createRental);
router.get('/:id', rentalController.getRental);
router.patch('/:id', rentalController.updateRental);
router.delete('/:id', requireAdmin, rentalController.deleteRental);


module.exports = router;
