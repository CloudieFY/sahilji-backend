const express = require('express');
const billController = require('../controllers/billController');

const router = express.Router();

router.get('/next', billController.getNextBillNo);

module.exports = router;

