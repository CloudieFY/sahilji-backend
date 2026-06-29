const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cors = require('cors');
const multer = require('multer');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

let dbReady = false;
let dbError = null;

// Middleware
app.use(cors({
  origin: true, // Dynamically reflects your frontend origin (fixes port mismatches like 5174)
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Home Route
app.get("/", (req, res) => {
  res.send("Rental Backend Running Successfully");
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    database: dbReady ? 'connected' : 'connecting',
    databaseError: dbError,
    timestamp: new Date().toISOString(),
  });
});

// API middleware
app.use('/api', (req, res, next) => {
  console.log(`[api] ${req.method} ${req.originalUrl}`);

  if (dbReady) {
    next();
    return;
  }

  res.status(503).json({
    error: dbError || 'Database is still connecting. Please try again in a moment.',
  });
});

// Routes
const authController = require('./controllers/authController');

// Staff management endpoints
app.get('/api/auth/users', authController.getUsers);
app.put('/api/auth/users/:identifier/status', authController.updateUserStatus);
app.delete('/api/auth/users/:identifier', authController.deleteUser);

// Auth routes
function safeRequire(routePath) {
  try {
    return require(routePath);
  } catch (err) {
    console.error(`[Warning] Could not load ${routePath}: ${err.message}`);
    const router = express.Router();
    router.all('*', (req, res) => res.status(501).json({ error: `API route not implemented yet: ${routePath}` }));
    return router;
  }
}

app.use('/api/auth', safeRequire('./routes/auth'));
app.use('/api/items', safeRequire('./routes/items'));
app.use('/api/customers', safeRequire('./routes/customers'));
app.use('/api/rentals', safeRequire('./routes/rentals'));
app.use('/api/bills', safeRequire('./routes/bills'));

// 404
app.use('*', (req, res) => {
  res.status(404).json({ error: `Route ${req.originalUrl} not found` });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
  console.log(`API health: http://localhost:${PORT}/health`);
});

// MongoDB Connect
if (!process.env.MONGODB_URI) {
  dbReady = false;
  dbError = 'MONGODB_URI is missing in .env file';
  console.error('[DB] ' + dbError);
} else {
  mongoose.connect(process.env.MONGODB_URI)
    .then(() => {
      dbReady = true;
      dbError = null;
      console.log('Connected to MongoDB Atlas');
    })
    .catch((err) => {
      dbReady = false;
      dbError = `MongoDB connection error: ${err.message}`;
      console.error(dbError);
    });
}

module.exports = app;